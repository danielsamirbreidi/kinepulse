/*==================================================
KINEPULSE V4
PARTIE 1
==================================================*/

let bookingData = {
    service: "",
    objectif: "",
    disponibilites: [],
    nom: "",
    telephone: "",
    email: ""
};

/*=========================================
ANIMATIONS
=========================================*/

const observer = new IntersectionObserver((entries)=>{

    entries.forEach(entry=>{

        if(entry.isIntersecting){

            entry.target.classList.add("show");

        }

    });

},{threshold:0.15});

document.querySelectorAll(".fade-up").forEach(el=>{

    observer.observe(el);

});

document.querySelectorAll(".philosophy-card").forEach(card=>{

    card.classList.add("fade-up");

    observer.observe(card);

});

document.querySelectorAll(".offer-box").forEach(box=>{

    box.classList.add("fade-up");

    observer.observe(box);

});

document.querySelectorAll(".adv-item").forEach(item=>{

    item.classList.add("fade-up");

    observer.observe(item);

});


/*=========================================
HEADER
=========================================*/

const header=document.querySelector("header");

window.addEventListener("scroll",()=>{

    if(window.scrollY>80){

        header.classList.add("scrolled");

    }else{

        header.classList.remove("scrolled");

    }

});


/*=========================================
FAQ
=========================================*/

document.querySelectorAll(".faq-question").forEach(question=>{

    question.addEventListener("click",()=>{

        question.parentElement.classList.toggle("active");

    });

});


/*=========================================
FORMULAIRE SIMPLE
=========================================*/

const form=document.querySelector(".booking-form");

if(form){

    form.addEventListener("submit",(e)=>{

        e.preventDefault();

        alert("Merci ! Votre demande a été envoyée.");

    });

}


/*=========================================
MODAL
=========================================*/

function openBooking(){

    document.getElementById("bookingModal").style.display="flex";

}

function closeBooking(){

    document.getElementById("bookingModal").style.display="none";

}

window.addEventListener("click",(e)=>{

    const modal=document.getElementById("bookingModal");

    if(e.target===modal){

        closeBooking();

    }

});
/*==================================================
PARTIE 2
RÉSERVATION
==================================================*/

function selectService(service){

    const content=document.getElementById("bookingContent");

    let html="";

    if(service==="EMS"){

        html=`

        <div class="step">

            <h3>Quel est votre objectif ?</h3>

            <button class="step-btn" onclick="showAvailability('EMS','Perte de poids')">Perte de poids</button>

            <button class="step-btn" onclick="showAvailability('EMS','Tonification')">Tonification</button>

            <button class="step-btn" onclick="showAvailability('EMS','Développement musculaire')">Développement musculaire</button>

            <button class="step-btn" onclick="showAvailability('EMS','Soulagement des douleurs')">Soulagement des douleurs</button>

            <button class="step-btn" onclick="showAvailability('EMS','Rééducation')">Rééducation</button>

            <button class="step-btn" onclick="showAvailability('EMS','Autre')">Autre</button>

        </div>

        `;

    }else{

        html=`

        <div class="step">

            <h3>Quelle est la raison de votre consultation ?</h3>

            <button class="step-btn" onclick="showAvailability('${service}','Cou')">Douleur au cou</button>

            <button class="step-btn" onclick="showAvailability('${service}','Dos')">Douleur au dos</button>

            <button class="step-btn" onclick="showAvailability('${service}','Épaules')">Épaules</button>

            <button class="step-btn" onclick="showAvailability('${service}','Jambes')">Jambes</button>

            <button class="step-btn" onclick="showAvailability('${service}','Stress')">Stress / Tensions</button>

            <button class="step-btn" onclick="showAvailability('${service}','Autre')">Autre</button>

        </div>

        `;

    }

    content.innerHTML=html;

}


function showAvailability(service,objectif){

    bookingData.service=service;
    bookingData.objectif=objectif;

    const content=document.getElementById("bookingContent");

    content.innerHTML=`

    <div class="step">

        <h3>Choisissez jusqu'à 3 disponibilités</h3>

        <p>Votre rendez-vous sera confirmé après vérification de notre agenda.</p>

        <div class="availability-grid">

            <label><input type="checkbox"> Lundi 15h00</label>
            <label><input type="checkbox"> Lundi 16h00</label>

            <label><input type="checkbox"> Mardi 15h00</label>
            <label><input type="checkbox"> Mardi 16h00</label>

            <label><input type="checkbox"> Mercredi 15h00</label>
            <label><input type="checkbox"> Mercredi 16h00</label>

            <label><input type="checkbox"> Jeudi 15h00</label>
            <label><input type="checkbox"> Jeudi 16h00</label>

        </div>

        <button class="hero-btn" style="margin-top:30px;" onclick="showContactForm()">

            Continuer

        </button>

    </div>

    `;


    const checks=document.querySelectorAll(".availability-grid input");

    checks.forEach(check=>{

        check.addEventListener("change",()=>{

            const checked=document.querySelectorAll(".availability-grid input:checked");

            if(checked.length>3){

                check.checked=false;

                alert("Vous pouvez sélectionner un maximum de 3 disponibilités.");

            }

        });

    });

}
/*==================================================
PARTIE 3
COORDONNÉES + CONFIRMATION
==================================================*/

function showContactForm(){

    bookingData.disponibilites=[];

    document.querySelectorAll(".availability-grid input:checked").forEach(item=>{

        bookingData.disponibilites.push(item.parentElement.innerText.trim());

    });

    const content=document.getElementById("bookingContent");

    content.innerHTML=`

    <div class="step">

        <h3>Vos coordonnées</h3>

        <p>Complétez vos informations pour que nous puissions communiquer avec vous.</p>

        <input
            id="bookingName"
            class="booking-input"
            type="text"
            placeholder="Nom complet"
        >

        <input
            id="bookingPhone"
            class="booking-input"
            type="tel"
            placeholder="Téléphone"
        >

        <input
            id="bookingEmail"
            class="booking-input"
            type="email"
            placeholder="Courriel"
        >

        <p class="booking-note">

        ⚠️ Ceci est une demande de réservation uniquement.
        Votre rendez-vous sera confirmé après vérification de nos disponibilités.

        </p>

        <button class="hero-btn" onclick="bookingSuccess()">

            Envoyer ma demande

        </button>

    </div>

    `;

}


function bookingSuccess(){

    const nom=document.getElementById("bookingName").value.trim();
    const telephone=document.getElementById("bookingPhone").value.trim();
    const email=document.getElementById("bookingEmail").value.trim();

    if(nom===""){

        alert("Veuillez entrer votre nom.");

        return;

    }

    if(telephone===""){

        alert("Veuillez entrer votre numéro de téléphone.");

        return;

    }

    if(email===""){

        alert("Veuillez entrer votre courriel.");

        return;

    }

    bookingData.nom=nom;
    bookingData.telephone=telephone;
    bookingData.email=email;

    console.log("Réservation :",bookingData);

    const content=document.getElementById("bookingContent");

    content.innerHTML=`

    <div class="step success">

        <h2>✅ Merci ${nom} !</h2>

        <p>

        Votre demande de réservation a bien été enregistrée.

        </p>

        <p>

        Nous communiquerons avec vous rapidement afin de confirmer un rendez-vous.

        </p>

        <button class="hero-btn" onclick="closeBooking()">

            Fermer

        </button>

    </div>

    `;

}
