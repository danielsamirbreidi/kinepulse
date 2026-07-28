/*==================================================
CLINIQUE KINÉPULSE V5
SCRIPT PRINCIPAL
==================================================*/

"use strict";

/*==================================================
CONFIGURATION
==================================================*/

const bookingData = {
    service: "",
    objectif: "",
    disponibilites: [],
    nom: "",
    telephone: "",
    email: ""
};

const modal = document.getElementById("bookingModal");
const bookingContent = document.getElementById("bookingContent");
const header = document.querySelector("header");


/*==================================================
ANIMATIONS
==================================================*/

const observer = new IntersectionObserver((entries) => {

    entries.forEach(entry => {

        if (entry.isIntersecting) {

            entry.target.classList.add("show");

        }

    });

}, {

    threshold: 0.15

});

document.querySelectorAll(".fade-up").forEach(el => {

    observer.observe(el);

});


/*==================================================
HEADER
==================================================*/

window.addEventListener("scroll", () => {

    if (window.scrollY > 60) {

        header.classList.add("scrolled");

    } else {

        header.classList.remove("scrolled");

    }

});


/*==================================================
FAQ
==================================================*/

document.querySelectorAll(".faq-question").forEach(question => {

    question.addEventListener("click", () => {

        const item = question.parentElement;

        item.classList.toggle("active");

    });

});


/*==================================================
MODAL
==================================================*/

function openBooking() {

    modal.style.display = "flex";

}

function closeBooking() {

    modal.style.display = "none";

}

window.addEventListener("click", (e) => {

    if (e.target === modal) {

        closeBooking();

    }

});


/*==================================================
OUTILS
==================================================*/

function resetBookingData() {

    bookingData.service = "";
    bookingData.objectif = "";
    bookingData.disponibilites = [];
    bookingData.nom = "";
    bookingData.telephone = "";
    bookingData.email = "";

}

function showMessage(message) {

    alert(message);

}
/*==================================================
RÉSERVATION - CHOIX DU SERVICE
==================================================*/

function selectService(service) {

    resetBookingData();

    bookingData.service = service;

    let html = "";

    if (service === "EMS") {

        html = `

        <div class="step">

            <h2>Quel est votre objectif ?</h2>

            <button class="step-btn" onclick="showAvailability('Perte de poids')">
                Perte de poids
            </button>

            <button class="step-btn" onclick="showAvailability('Tonification')">
                Tonification
            </button>

            <button class="step-btn" onclick="showAvailability('Développement musculaire')">
                Développement musculaire
            </button>

            <button class="step-btn" onclick="showAvailability('Soulagement des douleurs')">
                Soulagement des douleurs
            </button>

            <button class="step-btn" onclick="showAvailability('Rééducation')">
                Rééducation
            </button>

            <button class="step-btn" onclick="showAvailability('Autre')">
                Autre
            </button>

        </div>

        `;

    } else {

        html = `

        <div class="step">

            <h2>Quelle est la raison de votre consultation ?</h2>

            <button class="step-btn" onclick="showAvailability('Douleur au cou')">
                Douleur au cou
            </button>

            <button class="step-btn" onclick="showAvailability('Douleur au dos')">
                Douleur au dos
            </button>

            <button class="step-btn" onclick="showAvailability('Épaules')">
                Épaules
            </button>

            <button class="step-btn" onclick="showAvailability('Jambes')">
                Jambes
            </button>

            <button class="step-btn" onclick="showAvailability('Stress / Tensions')">
                Stress / Tensions
            </button>

            <button class="step-btn" onclick="showAvailability('Autre')">
                Autre
            </button>

        </div>

        `;

    }

    bookingContent.innerHTML = html;

}


/*==================================================
DISPONIBILITÉS
==================================================*/

function showAvailability(objectif) {

    bookingData.objectif = objectif;

    bookingContent.innerHTML = `

    <div class="step">

        <h2>Choisissez vos disponibilités</h2>

        <p>

        Sélectionnez jusqu'à <strong>3 disponibilités</strong>.

        Ceci est une demande de réservation.
        Votre rendez-vous sera confirmé après vérification de notre agenda.

        </p>

        <div class="availability-grid">

            <label><input type="checkbox" value="Lundi 15h00">Lundi 15h00</label>
            <label><input type="checkbox" value="Lundi 16h00">Lundi 16h00</label>

            <label><input type="checkbox" value="Mardi 15h00">Mardi 15h00</label>
            <label><input type="checkbox" value="Mardi 16h00">Mardi 16h00</label>

            <label><input type="checkbox" value="Mercredi 15h00">Mercredi 15h00</label>
            <label><input type="checkbox" value="Mercredi 16h00">Mercredi 16h00</label>

            <label><input type="checkbox" value="Jeudi 15h00">Jeudi 15h00</label>
            <label><input type="checkbox" value="Jeudi 16h00">Jeudi 16h00</label>

        </div>

        <button class="hero-btn"

            style="margin-top:30px"

            onclick="goToContactForm()">

            Continuer

        </button>

    </div>

    `;

    const checkboxes = document.querySelectorAll(".availability-grid input");

    checkboxes.forEach(box => {

        box.addEventListener("change", () => {

            const checked = document.querySelectorAll(".availability-grid input:checked");

            if (checked.length > 3) {

                box.checked = false;

                showMessage("Vous pouvez sélectionner un maximum de 3 disponibilités.");

            }

        });

    });

}
/*==================================================
FORMULAIRE DE CONTACT
==================================================*/

function goToContactForm() {

    bookingData.disponibilites = [];

    document
        .querySelectorAll(".availability-grid input:checked")
        .forEach(item => {

            bookingData.disponibilites.push(item.value);

        });

    if (bookingData.disponibilites.length === 0) {

        showMessage("Veuillez sélectionner au moins une disponibilité.");

        return;

    }

    bookingContent.innerHTML = `

    <div class="step">

        <h2>Vos coordonnées</h2>

        <p>

        Complétez vos informations afin que nous puissions communiquer avec vous.

        </p>

        <input
            id="bookingName"
            class="booking-input"
            type="text"
            placeholder="Nom complet">

        <input
            id="bookingPhone"
            class="booking-input"
            type="tel"
            placeholder="Téléphone">

        <input
            id="bookingEmail"
            class="booking-input"
            type="email"
            placeholder="Courriel">

        <p class="booking-note">

        ⚠️ Ceci est une demande de réservation.

        Nous communiquerons avec vous pour confirmer le rendez-vous.

        </p>

        <button
            id="sendBookingBtn"
            class="hero-btn"
            onclick="bookingSuccess()">

            Envoyer ma demande

        </button>

    </div>

    `;

}


/*==================================================
VALIDATION
==================================================*/

function bookingSuccess() {

    const nom = document.getElementById("bookingName").value.trim();

    const telephone = document.getElementById("bookingPhone").value.trim();

    const email = document.getElementById("bookingEmail").value.trim();


    if (nom.length < 2) {

        showMessage("Veuillez entrer votre nom.");

        return;

    }


    const phoneRegex = /^[0-9+() .-]{8,20}$/;

    if (!phoneRegex.test(telephone)) {

        showMessage("Veuillez entrer un numéro de téléphone valide.");

        return;

    }


    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {

        showMessage("Veuillez entrer un courriel valide.");

        return;

    }


    bookingData.nom = nom;

    bookingData.telephone = telephone;

    bookingData.email = email;


    const btn = document.getElementById("sendBookingBtn");

    btn.disabled = true;

    btn.innerHTML = "⏳ Envoi...";


    sendBooking();

}


/*==================================================
ENVOI
==================================================*/

function sendBooking() {

    console.log("Réservation :", bookingData);

    setTimeout(() => {

        bookingContent.innerHTML = `

        <div class="step success">

            <h2>

            ✅ Merci ${bookingData.nom} !

            </h2>

            <p>

            Votre demande de réservation a bien été enregistrée.

            </p>

            <p>

            Nous communiquerons avec vous rapidement afin de confirmer votre rendez-vous.

            </p>

            <button
                class="hero-btn"
                onclick="closeBooking()">

                Fermer

            </button>

        </div>

        `;

    }, 1000);

}
/*==================================================
NOTIFICATIONS
==================================================*/

function showMessage(message){

    const oldMessage = document.querySelector(".booking-message");

    if(oldMessage){

        oldMessage.remove();

    }

    const div = document.createElement("div");

    div.className = "booking-message";

    div.innerHTML = message;

    document.body.appendChild(div);

    setTimeout(()=>{

        div.classList.add("show");

    },50);

    setTimeout(()=>{

        div.classList.remove("show");

        setTimeout(()=>{

            div.remove();

        },300);

    },3000);

}


/*==================================================
FERMETURE AVEC ÉCHAP
==================================================*/

document.addEventListener("keydown",(e)=>{

    if(e.key==="Escape"){

        closeBooking();

    }

});


/*==================================================
RÉINITIALISER LA MODAL
==================================================*/

function resetBookingModal(){

    bookingContent.innerHTML=`

    <div class="step">

        <h2>

        Choisissez un service

        </h2>

        <button
            class="step-btn"
            onclick="selectService('Massage thérapeutique')">

            Massage thérapeutique

        </button>

        <button
            class="step-btn"
            onclick="selectService('EMS')">

            EMS

        </button>

        <button
            class="step-btn"
            onclick="selectService('Analyse corporelle 3D')">

            Analyse corporelle 3D

        </button>

    </div>

    `;

}


/*==================================================
FERMETURE MODAL
==================================================*/

const originalCloseBooking = closeBooking;

closeBooking = function(){

    modal.style.display="none";

    resetBookingData();

    resetBookingModal();

};


/*==================================================
POINT D'ENTRÉE FUTUR
==================================================*/

function sendBookingToServer(data){

    /*
    FUTUR :

    Google Calendar

    ↓

    Notion

    ↓

    n8n

    ↓

    Courriel de confirmation

    */

    console.log("Prêt à envoyer :",data);

}


/*==================================================
VERSION
==================================================*/

console.log("KinéPulse Script V5 chargé.");
/*==================================================
NOTIFICATION
==================================================*/

.booking-message{

    position:fixed;

    bottom:30px;

    left:50%;

    transform:translateX(-50%) translateY(20px);

    background:#0b2340;

    color:white;

    padding:16px 28px;

    border-radius:14px;

    box-shadow:0 15px 40px rgba(0,0,0,.25);

    opacity:0;

    transition:.3s;

    z-index:99999;

}

.booking-message.show{

    opacity:1;

    transform:translateX(-50%) translateY(0);

}
