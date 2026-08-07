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

    initChatWidget();

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

    const forms = document.querySelectorAll("form:not([data-custom-submit])");

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

/*==================================================
ASSISTANT DE CLAVARDAGE (CHAT WIDGET)
==================================================*/

function initChatWidget() {

    const CHAT_API_URL = "https://script.google.com/macros/s/AKfycbyTwYzKDtkQWL8t3z7ccTHB31DZ_tJi_IcTv_sqcZggiJIaFNWaaaklGY0FGaAHhE0DyA/exec";

    // --- Construit le HTML du widget et l'ajoute à la page ---
    const btn = document.createElement("button");
    btn.id = "chat-widget-btn";
    btn.setAttribute("aria-label", "Ouvrir le clavardage");
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

    const panel = document.createElement("div");
    panel.id = "chat-widget-panel";
    panel.innerHTML = `
        <div class="chat-widget-header">
            <div>
                <h4>Assistant KinéPulse</h4>
                <span>Répond généralement en quelques secondes</span>
            </div>
            <button class="chat-widget-close" aria-label="Fermer">&times;</button>
        </div>
        <div id="chat-widget-messages"></div>
        <form id="chat-widget-form">
            <input type="text" id="chat-widget-input" placeholder="Écrivez votre question..." autocomplete="off">
            <button type="submit" id="chat-widget-send" aria-label="Envoyer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
        </form>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    const messagesEl = document.getElementById("chat-widget-messages");
    const formEl = document.getElementById("chat-widget-form");
    const inputEl = document.getElementById("chat-widget-input");
    const closeBtn = panel.querySelector(".chat-widget-close");

    let history = []; // { role: "user"|"model", text: "..." }
    let opened = false;

    function addMessage(role, text) {
        const div = document.createElement("div");
        div.className = "chat-msg " + (role === "user" ? "user" : "bot");
        div.textContent = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function showTyping() {
        const div = document.createElement("div");
        div.className = "chat-msg bot typing";
        div.id = "chat-typing-indicator";
        div.innerHTML = "<span></span><span></span><span></span>";
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function hideTyping() {
        const el = document.getElementById("chat-typing-indicator");
        if (el) el.remove();
    }

    btn.addEventListener("click", () => {
        panel.classList.toggle("open");
        if (!opened) {
            opened = true;
            addMessage("bot", "Bonjour! Je suis l'assistant virtuel de KinéPulse. Je peux répondre à vos questions sur nos services, nos horaires, ou vous aider à réserver. Comment puis-je vous aider?");
        }
    });

    closeBtn.addEventListener("click", () => {
        panel.classList.remove("open");
    });

    formEl.addEventListener("submit", (event) => {
        event.preventDefault();

        const message = inputEl.value.trim();
        if (!message) return;

        addMessage("user", message);
        history.push({ role: "user", text: message });
        inputEl.value = "";
        inputEl.disabled = true;
        showTyping();

        fetch(CHAT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ type: "chat", message: message, history: history })
        })
            .then(res => res.json())
            .then(data => {
                hideTyping();
                inputEl.disabled = false;
                inputEl.focus();

                if (data.success) {
                    addMessage("bot", data.reply);
                    history.push({ role: "model", text: data.reply });
                } else {
                    addMessage("bot", "Désolé, une erreur est survenue. Vous pouvez nous joindre directement au (263) 378-2247.");
                }
            })
            .catch(() => {
                hideTyping();
                inputEl.disabled = false;
                addMessage("bot", "Désolé, une erreur est survenue. Vous pouvez nous joindre directement au (263) 378-2247.");
            });
    });
}
