/*==================================================
KINÉPULSE V1
SCRIPT.JS
==================================================*/

"use strict";

/*==================================================
INITIALISATION
==================================================*/

document.addEventListener("DOMContentLoaded", () => {

    initHeader();

    initMobileMenu();

    initBackToTop();

    initFAQ();

    initAnimations();

});


/*==================================================
HEADER AU SCROLL
==================================================*/

function initHeader() {

    const header = document.querySelector("header");

    if (!header) return;

    function updateHeader() {

        if (window.scrollY > 50) {

            header.classList.add("scrolled");

        } else {

            header.classList.remove("scrolled");

        }

    }

    updateHeader();

    window.addEventListener("scroll", updateHeader);

}


/*==================================================
MENU MOBILE
==================================================*/

function initMobileMenu() {

    const hamburger = document.querySelector(".hamburger");

    const menu = document.querySelector(".nav-menu");

    if (!hamburger || !menu) return;

    hamburger.addEventListener("click", () => {

        menu.classList.toggle("active");

        hamburger.classList.toggle("active");

    });

    document.querySelectorAll(".nav-menu a").forEach(link => {

        link.addEventListener("click", () => {

            menu.classList.remove("active");

            hamburger.classList.remove("active");

        });

    });

}


/*==================================================
BOUTON RETOUR EN HAUT
==================================================*/

function initBackToTop() {

    const button = document.getElementById("backToTop");

    if (!button) return;

    function updateButton() {

        if (window.scrollY > 500) {

            button.classList.add("show");

        } else {

            button.classList.remove("show");

        }

    }

    updateButton();

    window.addEventListener("scroll", updateButton);

    button.addEventListener("click", () => {

        window.scrollTo({

            top: 0,

            behavior: "smooth"

        });

    });

}
/*==================================================
FAQ
==================================================*/

function initFAQ() {

    const questions = document.querySelectorAll(".faq-question");

    if (!questions.length) return;

    questions.forEach(question => {

        question.addEventListener("click", () => {

            const item = question.parentElement;

            const isActive = item.classList.contains("active");

            document.querySelectorAll(".faq-item").forEach(faq => {

                faq.classList.remove("active");

            });

            if (!isActive) {

                item.classList.add("active");

            }

        });

    });

}


/*==================================================
ANIMATIONS AU SCROLL
==================================================*/

function initAnimations() {

    const elements = document.querySelectorAll(

        ".fade-up, .service-card, .adv-card, .step-card, .testimonial-card, .contact-card"

    );

    if (!elements.length) return;

    const observer = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.classList.add("show");

                observer.unobserve(entry.target);

            }

        });

    }, {

        threshold: 0.15

    });

    elements.forEach(element => {

        if (!element.classList.contains("fade-up")) {

            element.classList.add("fade-up");

        }

        observer.observe(element);

    });

}


/*==================================================
UTILITAIRE
==================================================*/

function scrollToSection(id) {

    const section = document.getElementById(id);

    if (!section) return;

    section.scrollIntoView({

        behavior: "smooth",

        block: "start"

    });

}
/*==================================================
FORMULAIRES
==================================================*/

let bookingData = {

    service: "",

    duration: "",

    objectif: "",

    disponibilites: [],

    nom: "",

    telephone: "",

    email: ""

};


/*==================================================
INITIALISATION FORMULAIRES
==================================================*/

document.addEventListener("DOMContentLoaded", () => {

    initForms();

});


function initForms() {

    const forms = document.querySelectorAll("form");

    forms.forEach(form => {

        form.addEventListener("submit", handleFormSubmit);

    });

}


/*==================================================
ENVOI FORMULAIRE
==================================================*/

function handleFormSubmit(event) {

    event.preventDefault();

    const form = event.target;

    const data = new FormData(form);

    bookingData.service = data.get("service") || "";

    bookingData.duration = data.get("duration") || "";

    bookingData.objectif = data.get("objectif") || "";

    bookingData.nom = data.get("nom") || "";

    bookingData.telephone = data.get("telephone") || "";

    bookingData.email = data.get("email") || "";

    bookingData.disponibilites = data.getAll("disponibilites");

    console.log("Réservation :", bookingData);

    alert(

        "Merci ! Votre demande a été envoyée avec succès."

    );

    form.reset();

}
