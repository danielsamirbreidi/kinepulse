/*==================================================
KINÉPULSE — INTÉGRATION RÉSERVATION
Relie les formulaires massage / EMS au backend :
serveur KinéPulse pour les réservations massage,
Google Apps Script pour le reste (Calendar + Notion + courriels)
==================================================*/

"use strict";

// ⚠️ À REMPLACER après le déploiement du script Google Apps Script
// (voir README-automatisation.md pour les étapes)
const BOOKING_API_URL = "https://script.google.com/macros/s/AKfycbwVumxoiEIMVGlC6Q0EO3W2JQy8WKPUFIwRbou6tD7quG-j1vhwprESdqLOT8j8xZckig/exec";

// Réservations massage : serveur rapide de la clinique (3 s au lieu de 10–30 s).
// Contact, fiche santé et demandes EMS restent sur Google Apps Script,
// qui sert aussi de repli si le serveur ne répond pas.
const MASSAGE_BOOKING_API_URL = "https://api.kinepulse.ca/book";

// Créneaux : lus dans Google Agenda via le serveur rapide api.kinepulse.ca
// (adresse propre de la clinique, DNS chez WHC, certificat Let's Encrypt).
// En cas d'échec, Apps Script (BOOKING_API_URL) sert de repli.
// (Le tunnel Cloudflare a été retiré le 2026-11-06 : son adresse
// apparaissait dans le site et Google a refusé les pubs « site compromis ».)
const SLOTS_API_URL = "https://api.kinepulse.ca/slots";
const SLOTS_TIMEOUT_MS = 5000;

function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

// Envoie une réservation massage : serveur rapide d'abord, Apps Script en repli
// si le serveur ne répond pas (le repli vérifie le chevauchement : pas de double réservation).
function postMassageBooking(payload) {
    const opts = {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite le préflight CORS
        body: JSON.stringify(payload)
    };
    return fetch(MASSAGE_BOOKING_API_URL, opts)
        .then(res => res.json())
        .catch(() => fetch(BOOKING_API_URL, opts).then(res => res.json()));
}

// Lit les créneaux via api.kinepulse.ca (serveur rapide). En cas d'échec (délai dépassé,
// erreur réseau, réponse non OK ou success:false), réessaie une fois.
function fetchSlots(duration) {
    const serverUrl = `${SLOTS_API_URL}?action=slots&duration=${duration}`;
    const fallbackUrl = `${BOOKING_API_URL}?action=slots&duration=${duration}`;
    return fetchWithTimeout(serverUrl, SLOTS_TIMEOUT_MS)
        .then(res => {
            if (!res.ok) throw new Error("server slots failed");
            return res.json();
        })
        .then(data => {
            if (!data.success) throw new Error("server slots unsuccessful");
            return data;
        })
        .catch(() => fetch(fallbackUrl).then(res => res.json()));
}

// Valide qu'un numéro de téléphone est plausible: exactement 10 chiffres
// (11 si préfixé par 1), pas une suite de chiffres identiques (ex: 0000000000)
function isValidPhone(rawValue) {
    const digits = (rawValue || "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
    if (digits.length !== 10) return false;
    if (/^(\d)\1{9}$/.test(digits)) return false; // tous les chiffres identiques
    return true;
}

// Valide qu'une adresse ressemble à une vraie adresse: assez longue et
// contient au moins une lettre (pas juste un numéro civique isolé)
function isValidAddress(rawValue) {
    const value = (rawValue || "").trim();
    if (value.length < 8) return false;
    if (!/[a-zA-ZÀ-ÿ]/.test(value)) return false;
    return true;
}

document.addEventListener("DOMContentLoaded", () => {
    initMassageBooking();
    initEmsLead();
    initHealthIntake();
    initContactForm();
});

/*==================================================
FORMULAIRE DE CONTACT
==================================================*/

function initContactForm() {

    const form = document.getElementById("contactForm");
    if (!form) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(form);

        if (!isValidPhone(formData.get("telephone"))) {
            alert("Veuillez entrer un numéro de téléphone valide (10 chiffres).");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalLabel = submitBtn.textContent;

        const payload = {
            type: "contact",
            nom: formData.get("nom"),
            telephone: formData.get("telephone"),
            email: formData.get("email"),
            sujet: formData.get("service"),
            message: formData.get("message")
        };

        submitBtn.disabled = true;
        submitBtn.textContent = "Envoi en cours...";

        fetch(BOOKING_API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {

                if (data.success) {
                    form.innerHTML = `
                        <div class="success">
                            <h2>Message envoyé !</h2>
                            <p>Merci ! Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.</p>
                        </div>
                    `;
                    form.scrollIntoView({ behavior: "smooth", block: "center" });
                } else {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalLabel;
                    alert("Une erreur est survenue. Veuillez réessayer ou nous appeler directement.");
                }

            })
            .catch(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = originalLabel;
                alert("Une erreur est survenue. Veuillez réessayer ou nous appeler directement.");
            });
    });
}

/*==================================================
FICHE SANTÉ — ENVOI (LIÉE AU CLIENT DANS NOTION)
==================================================*/

function initDobSelectors() {

    const dayEl = document.getElementById("dob-day");
    const monthEl = document.getElementById("dob-month");
    const yearEl = document.getElementById("dob-year");
    const hiddenEl = document.getElementById("dob-hidden");

    if (!dayEl || !monthEl || !yearEl || !hiddenEl) return;

    const MOIS_FR = [
        ["01", "Janvier"], ["02", "Février"], ["03", "Mars"], ["04", "Avril"],
        ["05", "Mai"], ["06", "Juin"], ["07", "Juillet"], ["08", "Août"],
        ["09", "Septembre"], ["10", "Octobre"], ["11", "Novembre"], ["12", "Décembre"]
    ];

    for (let d = 1; d <= 31; d++) {
        const val = String(d).padStart(2, "0");
        dayEl.insertAdjacentHTML("beforeend", `<option value="${val}">${d}</option>`);
    }

    MOIS_FR.forEach(([val, label]) => {
        monthEl.insertAdjacentHTML("beforeend", `<option value="${val}">${label}</option>`);
    });

    // De l'année courante jusqu'à 100 ans en arrière, en ordre décroissant
    // (les années récentes s'affichent en premier dans la liste déroulante,
    // mais on peut sélectionner directement n'importe quelle année sans défiler)
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 100; y--) {
        yearEl.insertAdjacentHTML("beforeend", `<option value="${y}">${y}</option>`);
    }

    function updateHidden() {
        if (dayEl.value && monthEl.value && yearEl.value) {
            hiddenEl.value = `${yearEl.value}-${monthEl.value}-${dayEl.value}`;
        } else {
            hiddenEl.value = "";
        }
    }

    [dayEl, monthEl, yearEl].forEach(el => el.addEventListener("change", updateHidden));
}

function initHealthIntake() {

    const form = document.getElementById("intake-form");
    if (!form) return;

    initDobSelectors();

    // Pré-remplit avec les infos déjà connues (lien personnalisé envoyé après une réservation)
    const params = new URLSearchParams(window.location.search);
    const nomField = document.getElementById("intake-nom");
    const telField = document.getElementById("intake-telephone");
    const emailField = document.getElementById("intake-email");

    if (params.get("nom") && nomField) nomField.value = params.get("nom");
    if (params.get("telephone") && telField) telField.value = params.get("telephone");
    if (params.get("email") && emailField) emailField.value = params.get("email");

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(form);

        if (!formData.get("date_naissance")) {
            alert("Veuillez indiquer votre date de naissance complète (jour, mois et année).");
            return;
        }

        if (!isValidPhone(formData.get("telephone"))) {
            alert("Veuillez entrer un numéro de téléphone valide (10 chiffres).");
            return;
        }

        if (!isValidAddress(formData.get("adresse"))) {
            alert("Veuillez entrer une adresse complète (numéro, rue et ville).");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalLabel = submitBtn.textContent;

        const payload = {
            type: "intake",
            nom: formData.get("nom"),
            telephone: formData.get("telephone"),
            email: formData.get("email"),
            dateNaissance: formData.get("date_naissance"),
            adresse: formData.get("adresse"),
            emploi: formData.get("emploi"),
            assurance: formData.get("assurance"),
            compagnieAssurance: formData.get("compagnie_assurance"),
            antecedents: formData.get("antecedents"),
            medicaments: formData.get("medicaments"),
            blessures: formData.get("blessures"),
            objectif: formData.get("objectif")
        };

        submitBtn.disabled = true;
        submitBtn.textContent = "Envoi en cours...";

        fetch(BOOKING_API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {

                if (data.success) {
                    form.innerHTML = `
                        <div class="success">
                            <h2>Merci !</h2>
                            <p>Votre fiche santé a bien été reçue. À bientôt en clinique.</p>
                        </div>
                    `;
                    form.scrollIntoView({ behavior: "smooth", block: "center" });
                } else {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalLabel;
                    alert("Une erreur est survenue. Veuillez réessayer ou nous appeler directement.");
                }

            })
            .catch(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = originalLabel;
                alert("Une erreur est survenue. Veuillez réessayer ou nous appeler directement.");
            });
    });
}

/*==================================================
MASSAGE — CRÉNEAUX RÉELS + RÉSERVATION
==================================================*/

function initMassageBooking() {

    const form = document.getElementById("massage-booking-form");
    if (!form) return;

    const slotValueInput = document.getElementById("massage-slot-value");
    const statusEl = document.getElementById("massage-slot-status");
    const submitBtn = document.getElementById("massage-submit-btn");
    const durationInputs = form.querySelectorAll('input[name="duration"]');

    // Consentement : message français visible si la case n'est pas cochée
    // (la validation native du navigateur bloque l'envoi avant le handler,
    // sa bulle anglaise est remplacée par ce message en français).
    const consentInput = form.querySelector('input[name="consentement"]');
    const consentError = document.getElementById("massage-consent-error");
    const CONSENT_MSG = "Cochez la case pour accepter que vos renseignements soient utilisés pour traiter votre demande.";

    function showConsentError() {
        if (consentError) consentError.style.display = "block";
        if (consentInput) consentInput.closest("label").style.outline = "2px solid #e57373";
        if (consentError) consentError.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function hideConsentError() {
        if (consentError) consentError.style.display = "none";
        if (consentInput) consentInput.closest("label").style.outline = "";
    }

    if (consentInput) {
        // Message défini dès le chargement : la bulle affiche ce texte en
        // français même si la validation native bloque l'envoi avant le handler.
        consentInput.setCustomValidity(CONSENT_MSG);
        consentInput.addEventListener("invalid", () => {
            showConsentError();
        });
        // Dès que la case est cochée, on efface le message (sinon setCustomValidity
        // garderait le champ invalide même coché) ; si on la décoche, on le remet.
        consentInput.addEventListener("change", () => {
            consentInput.setCustomValidity(consentInput.checked ? "" : CONSENT_MSG);
            if (consentInput.checked) hideConsentError();
        });
    }


    const monthLabel = document.getElementById("cal-month-label");
    const gridEl = document.getElementById("cal-grid");
    const timeslotsEl = document.getElementById("cal-timeslots");
    const prevBtn = document.getElementById("cal-prev");
    const nextBtn = document.getElementById("cal-next");

    const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    let slotsByDate = {};   // { "2026-08-04": [{time,label}, ...] }
    let viewMonth = new Date();
    viewMonth.setDate(1);
    let selectedDate = null;

    function applySlotsData(data) {

        if (statusEl) { statusEl.textContent = ""; statusEl.style.display = "none"; }

        slotsByDate = {};

        if (data.success && data.slots) {
            data.slots.forEach(slot => {
                if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
                slotsByDate[slot.date].push(slot);
            });
        }

        // Ouvre le calendrier sur le premier mois qui contient un créneau
        const firstDate = data.slots && data.slots.length ? data.slots[0].date : null;
        if (firstDate) {
            const [y, m] = firstDate.split("-").map(Number);
            viewMonth = new Date(y, m - 1, 1);
        }

        renderCalendar();
    }

    function loadSlots() {

        const duration = form.querySelector('input[name="duration"]:checked').value.indexOf("90") !== -1 ? 90 : 60;
        const cacheKey = "kinepulse-slots-" + duration;

        // Cache court (5 min) : la visite suivante et le changement de service
        // affichent le calendrier tout de suite, puis les créneaux frais arrivent
        // en arrière-plan. Un créneau pris entre-temps reste bloqué à l'envoi
        // (le serveur répond SLOT_TAKEN), donc le cache ne peut pas créer
        // de double réservation.
        let cached = null;
        try {
            const raw = sessionStorage.getItem(cacheKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.t && (Date.now() - parsed.t) < 300000 && parsed.data && parsed.data.success) {
                    cached = parsed.data;
                }
            }
        } catch (e) { cached = null; }

        timeslotsEl.innerHTML = "";
        slotValueInput.value = "";
        selectedDate = null;

        if (cached) {
            applySlotsData(cached);
        } else {
            // Squelette immédiat : la grille du mois s'affiche tout de suite,
            // tous les jours grisés et inactifs tant que les créneaux ne sont
            // pas arrivés (renderCalendar désactive les jours sans créneau).
            showStatus(statusEl, "Chargement des créneaux...", false);
            renderCalendar();
        }

        fetchSlots(duration)
            .then(data => {
                if (data.success) {
                    try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
                }
                // Ne pas écraser un choix en cours : on ne rafraîchit l'affichage
                // que si le client n'a encore rien sélectionné.
                if (!cached || (slotValueInput.value === "" && selectedDate === null)) {
                    applySlotsData(data);
                }
            })
            .catch(() => {
                if (!cached) {
                    gridEl.innerHTML = '<p style="grid-column:1/-1;font-size:.85rem;color:var(--text-light);">Erreur de chargement — réessayez plus tard.</p>';
                }
            });
    }

    function renderCalendar() {

        monthLabel.textContent = MOIS_FR[viewMonth.getMonth()] + " " + viewMonth.getFullYear();

        const year = viewMonth.getFullYear();
        const month = viewMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const startOffset = (firstDay.getDay() + 6) % 7; // lundi = 0
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let html = "";

        for (let i = 0; i < startOffset; i++) {
            html += '<div class="cal-day empty"></div>';
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const hasSlots = !!slotsByDate[dateStr];
            const isSelected = dateStr === selectedDate;

            html += `<button type="button" class="cal-day${hasSlots ? " available" : ""}${isSelected ? " selected" : ""}" data-date="${dateStr}" ${hasSlots ? "" : "disabled"}>
                ${d}
            </button>`;
        }

        gridEl.innerHTML = html;

        gridEl.querySelectorAll(".cal-day.available").forEach(btn => {
            btn.addEventListener("click", () => {
                selectedDate = btn.dataset.date;
                slotValueInput.value = "";
                renderCalendar();
                renderTimeslots();
            });
        });

        // Désactive/active les flèches selon la fenêtre de réservation (21 jours)
        const today = new Date();
        prevBtn.disabled = (year === today.getFullYear() && month <= today.getMonth());
    }

    function renderTimeslots() {

        if (!selectedDate || !slotsByDate[selectedDate]) {
            timeslotsEl.innerHTML = "";
            return;
        }

        const dateObj = new Date(selectedDate + "T00:00:00");
        const label = dateObj.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });

        let html = `<p class="cal-selected-date">${label}</p><div class="cal-times">`;

        slotsByDate[selectedDate].forEach(slot => {
            const isActive = slotValueInput.value === `${slot.date}|${slot.time}`;
            html += `<button type="button" class="cal-time-btn${isActive ? " active" : ""}" data-value="${slot.date}|${slot.time}">${slot.time}</button>`;
        });

        html += "</div>";
        timeslotsEl.innerHTML = html;

        timeslotsEl.querySelectorAll(".cal-time-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                slotValueInput.value = btn.dataset.value;
                timeslotsEl.querySelectorAll(".cal-time-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
            });
        });
    }

    prevBtn.addEventListener("click", () => {
        viewMonth.setMonth(viewMonth.getMonth() - 1);
        renderCalendar();
    });

    nextBtn.addEventListener("click", () => {
        viewMonth.setMonth(viewMonth.getMonth() + 1);
        renderCalendar();
    });

    durationInputs.forEach(input => {
        input.addEventListener("change", loadSlots);
    });

    loadSlots();

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const slotValue = slotValueInput.value;
        if (!slotValue) {
            showStatus(statusEl, "Veuillez choisir un jour et une heure avant d'envoyer votre demande.", true);
            return;
        }

        const [date, time] = slotValue.split("|");
        const formData = new FormData(form);

        if (!isValidPhone(formData.get("telephone"))) {
            showStatus(statusEl, "Veuillez entrer un numéro de téléphone valide (10 chiffres).", true);
            return;
        }

        if (consentInput && !consentInput.checked) {
            consentInput.setCustomValidity(CONSENT_MSG);
            showStatus(statusEl, CONSENT_MSG, true);
            showConsentError();
            return;
        }

        const payload = {
            type: "massage",
            nom: formData.get("nom"),
            telephone: formData.get("telephone"),
            email: formData.get("email"),
            duration: formData.get("duration"),
            source: formData.get("source"),
            date: date,
            time: time
        };

        submitBtn.disabled = true;
        submitBtn.textContent = "Envoi en cours...";

        postMassageBooking(payload)
            .then(data => {

                if (data.success) {
                    const dateObj = new Date(date + "T00:00:00");
                    const dateLabel = dateObj.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
                    form.innerHTML = `
                        <div class="success">
                            <h2>Rendez-vous confirmé !</h2>
                            <p class="success-detail">${payload.duration} — ${dateLabel} à ${time}</p>
                            <p>Un courriel de confirmation vient de vous être envoyé. Au plaisir de vous accueillir.</p>
                        </div>
                    `;
                    form.scrollIntoView({ behavior: "smooth", block: "center" });
                    // Conversion Google Ads : Réservation Massothérapie
                    if (typeof gtag === "function") {
                        gtag('event', 'conversion', {
                            'send_to': 'AW-18483395101/rBAFCNeJ7ZUdEJ30yO1E',
                            'value': 110.0,
                            'currency': 'CAD'
                        });
                        // Événement GA4 (propriété G-0CBW9YZYLY) — suivi indépendant de la
                        // conversion Ads ci-dessus, pour voir les réservations dans GA4
                        // même si le signal Ads est bloqué (ex: consentement publicitaire)
                        gtag('event', 'reservation_complete', {
                            'event_category': 'reservation',
                            'service': payload.duration,
                            'value': 110,
                            'currency': 'CAD'
                        });
                    }
                } else if (data.error === "SLOT_TAKEN") {
                    showStatus(statusEl, "Ce créneau vient d'être réservé par quelqu'un d'autre. Choisissez-en un autre.", true);
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Confirmer ma réservation";
                    loadSlots();
                } else {
                    showStatus(statusEl, "Une erreur est survenue. Veuillez réessayer ou nous appeler directement.", true);
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Confirmer ma réservation";
                }

            })
            .catch(() => {
                showStatus(statusEl, "Une erreur est survenue. Veuillez réessayer ou nous appeler directement.", true);
                submitBtn.disabled = false;
                submitBtn.textContent = "Confirmer ma réservation";
            });
    });
}

/*==================================================
EMS — ENVOI DE LA DEMANDE (LISTE DE SUIVI, PAS DE RDV)
==================================================*/

function initEmsLead() {

    const form = document.getElementById("ems-lead-form");
    if (!form) return;

    // Champ texte "Autre" : visible seulement si la case est cochée
    const autreCheck = document.getElementById("dispo-autre-check");
    const autreText = document.getElementById("dispo-autre-text");
    if (autreCheck && autreText) {
        if (autreText.type === "date") {
            autreText.min = new Date().toISOString().split("T")[0];
        }
        autreCheck.addEventListener("change", () => {
            autreText.style.display = autreCheck.checked ? "block" : "none";
            if (autreCheck.checked) autreText.focus();
            else autreText.value = "";
        });
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(form);

        if (!isValidPhone(formData.get("telephone"))) {
            alert("Veuillez entrer un numéro de téléphone valide (10 chiffres).");
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalLabel = submitBtn.textContent;

        // "Autre" : remplace par la date choisie par le client (format JJ/MM/AAAA)
        const autreDateRaw = (formData.get("disponibilite_autre") || "").trim();
        let autreTexte = "";
        if (autreDateRaw) {
            const [y, m, d] = autreDateRaw.split("-");
            autreTexte = d && m && y ? `${d}/${m}/${y}` : autreDateRaw;
        }
        const disponibilites = formData.getAll("disponibilites").map(v =>
            v === "Autre" ? (autreTexte ? "Autre : " + autreTexte : "Autre") : v
        );

        const payload = {
            type: "ems",
            nom: formData.get("nom"),
            telephone: formData.get("telephone"),
            email: formData.get("email"),
            objectif: formData.get("objectif"),
            source: formData.get("source"),
            disponibilites: disponibilites
        };

        submitBtn.disabled = true;
        submitBtn.textContent = "Envoi en cours...";

        fetch(BOOKING_API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {

                if (data.success) {
                    form.innerHTML = `
                        <div class="success">
                            <h2>Demande envoyée !</h2>
                            <p>Merci ! Nous avons bien reçu votre demande et nous vous contacterons sous peu afin de planifier votre séance.</p>
                        </div>
                    `;
                    form.scrollIntoView({ behavior: "smooth", block: "center" });
                    // Conversion Google Ads : Demande EMS
                    if (typeof gtag === "function") {
                        gtag('event', 'conversion', {
                            'send_to': 'AW-18483395101/goaGCIzX7pUdEJ30yO1E',
                            'value': 165.0,
                            'currency': 'CAD'
                        });
                        // Événement GA4 — même logique que la réservation massage
                        gtag('event', 'demande_ems_complete', {
                            'event_category': 'reservation',
                            'value': 165,
                            'currency': 'CAD'
                        });
                    }
                } else {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalLabel;
                    alert("Une erreur est survenue. Veuillez réessayer ou nous appeler directement.");
                }

            })
            .catch(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = originalLabel;
                alert("Une erreur est survenue. Veuillez réessayer ou nous appeler directement.");
            });
    });
}

function showStatus(el, message, isError) {
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
    el.style.color = isError ? "#e57373" : "var(--primary-light)";
}
