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
});

/*==================================================
MASSAGE — CRÉNEAUX RÉELS + RÉSERVATION
==================================================*/

function initMassageBooking() {

    const form = document.getElementById("massage-booking-form");
    if (!form) return;

    const slotSelect = document.getElementById("massage-slot-select");
    const statusEl = document.getElementById("massage-slot-status");
    const submitBtn = document.getElementById("massage-submit-btn");
    const durationInputs = form.querySelectorAll('input[name="duration"]');

    function loadSlots() {

        const duration = form.querySelector('input[name="duration"]:checked').value === "90 minutes" ? 90 : 60;

        slotSelect.innerHTML = '<option value="">Chargement des créneaux disponibles...</option>';
        slotSelect.disabled = true;

        fetch(`${BOOKING_API_URL}?action=slots&duration=${duration}`)
            .then(res => res.json())
            .then(data => {

                slotSelect.innerHTML = "";
                slotSelect.disabled = false;

                if (!data.success || !data.slots || data.slots.length === 0) {
                    slotSelect.innerHTML = '<option value="">Aucun créneau disponible actuellement</option>';
                    return;
                }

                const placeholder = document.createElement("option");
                placeholder.value = "";
                placeholder.textContent = "Choisissez un créneau";
                slotSelect.appendChild(placeholder);

                data.slots.forEach(slot => {
                    const opt = document.createElement("option");
                    opt.value = `${slot.date}|${slot.time}`;
                    opt.textContent = slot.label;
                    slotSelect.appendChild(opt);
                });

            })
            .catch(() => {
                slotSelect.innerHTML = '<option value="">Erreur de chargement — réessayez plus tard</option>';
                slotSelect.disabled = false;
            });
    }

    durationInputs.forEach(input => {
        input.addEventListener("change", loadSlots);
    });

    loadSlots();

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const slotValue = slotSelect.value;
        if (!slotValue) {
            showStatus(statusEl, "Veuillez choisir un créneau avant d'envoyer votre demande.", true);
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
                    form.innerHTML = `
                        <div class="success">
                            <h2>Rendez-vous confirmé !</h2>
                            <p>Un courriel de confirmation vient de vous être envoyé. Au plaisir de vous accueillir.</p>
                        </div>
                    `;
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
