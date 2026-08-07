/*==================================================
KINÉPULSE — INTÉGRATION RÉSERVATION
Relie les formulaires massage / EMS au backend
Google Apps Script (Calendar + Notion + courriels)
==================================================*/

"use strict";

// ⚠️ À REMPLACER après le déploiement du script Google Apps Script
// (voir README-automatisation.md pour les étapes)
const BOOKING_API_URL = "https://script.google.com/macros/s/AKfycbyTwYzKDtkQWL8t3z7ccTHB31DZ_tJi_IcTv_sqcZggiJIaFNWaaaklGY0FGaAHhE0DyA/exec";

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

function initHealthIntake() {

    const form = document.getElementById("intake-form");
    if (!form) return;

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
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalLabel = submitBtn.textContent;

        const payload = {
            type: "intake",
            nom: formData.get("nom"),
            telephone: formData.get("telephone"),
            email: formData.get("email"),
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

    function loadSlots() {

        const duration = form.querySelector('input[name="duration"]:checked').value.indexOf("90") !== -1 ? 90 : 60;

        gridEl.innerHTML = '<div class="cal-loading"><span class="cal-spinner"></span>Chargement des créneaux...</div>';
        timeslotsEl.innerHTML = "";
        slotValueInput.value = "";
        selectedDate = null;

        fetch(`${BOOKING_API_URL}?action=slots&duration=${duration}`)
            .then(res => res.json())
            .then(data => {

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

            })
            .catch(() => {
                gridEl.innerHTML = '<p style="grid-column:1/-1;font-size:.85rem;color:var(--text-light);">Erreur de chargement — réessayez plus tard.</p>';
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

        const payload = {
            type: "massage",
            nom: formData.get("nom"),
            telephone: formData.get("telephone"),
            email: formData.get("email"),
            duration: formData.get("duration"),
            dateNaissance: formData.get("date_naissance"),
            date: date,
            time: time
        };

        submitBtn.disabled = true;
        submitBtn.textContent = "Envoi en cours...";

        fetch(BOOKING_API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite le préflight CORS
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
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

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalLabel = submitBtn.textContent;

        const payload = {
            type: "ems",
            nom: formData.get("nom"),
            telephone: formData.get("telephone"),
            email: formData.get("email"),
            objectif: formData.get("objectif"),
            disponibilites: formData.getAll("disponibilites")
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
