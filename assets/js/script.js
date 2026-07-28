// Animation des sections

const observer = new IntersectionObserver((entries)=>{

entries.forEach(entry=>{

if(entry.isIntersecting){

entry.target.classList.add("show");

}

});

},{threshold:0.15});

document.querySelectorAll(".fade-up").forEach((el)=>{

observer.observe(el);

});

// Header au scroll

const header=document.querySelector("header");

window.addEventListener("scroll",()=>{

if(window.scrollY>80){

header.classList.add("scrolled");

}else{

header.classList.remove("scrolled");

}

});
document.querySelectorAll(".step").forEach((card)=>{

card.classList.add("fade-up");

observer.observe(card);

});
document.querySelectorAll(".offer-box").forEach((box)=>{

box.classList.add("fade-up");

observer.observe(box);

});
const form=document.querySelector(".booking-form");

form.addEventListener("submit",(e)=>{

e.preventDefault();

alert("Merci ! Votre demande a été envoyée. Nous vous contacterons rapidement.");

});
document.querySelectorAll(".faq-question").forEach(question=>{

question.addEventListener("click",()=>{

const item=question.parentElement;

item.classList.toggle("active");

});

});
document.querySelector(".hamburger").addEventListener("click",()=>{

alert("Le menu mobile sera ajouté dans la prochaine livraison.");

});
document.querySelectorAll(".philosophy-card").forEach(card=>{

card.classList.add("fade-up");

observer.observe(card);

});
document.querySelectorAll(".adv-item").forEach(item=>{

item.classList.add("fade-up");

observer.observe(item);

});
window.addEventListener("scroll",()=>{

const header=document.querySelector("header");

if(window.scrollY>80){

header.classList.add("scrolled");

}else{

header.classList.remove("scrolled");

}

});
function openBooking(){

document.getElementById("bookingModal").style.display="flex";

}

function closeBooking(){

document.getElementById("bookingModal").style.display="none";

}

window.onclick=function(e){

const modal=document.getElementById("bookingModal");

if(e.target===modal){

closeBooking();

}

}

function selectService(service){

const content=document.getElementById("bookingContent");

let question="";

if(service==="EMS"){

question=`

<div class="step">

<h3>Quel est votre objectif ?</h3>

<button class="step-btn" onclick="showAvailability('${service}','Perte de poids')">Perte de poids</button>

<button class="step-btn" onclick="showAvailability('${service}','Tonification')">Tonification</button>

<button class="step-btn" onclick="showAvailability('${service}','Masse musculaire')">Développer la masse musculaire</button>

<button class="step-btn" onclick="showAvailability('${service}','Soulagement des douleurs')">Soulager des douleurs</button>

<button class="step-btn" onclick="showAvailability('${service}','Rééducation')">Rééducation</button>

<button class="step-btn" onclick="showAvailability('${service}','Autre')">Autre</button>

</div>

`;

}else{

question=`

<div class="step">

<h3>Quelle est la raison de votre consultation ?</h3>

<button class="step-btn" onclick="showAvailability('${service}','Cou')">Douleur au cou</button>

<button class="step-btn" onclick="showAvailability('${service}','Dos')">Douleur au dos</button>

<button class="step-btn" onclick="showAvailability('${service}','Épaules')">Épaules</button>

<button class="step-btn" onclick="showAvailability('${service}','Jambes')">Jambes</button>

<button class="step-btn" onclick="showAvailability('${service}','Stress')">Stress / tension</button>

<button class="step-btn" onclick="showAvailability('${service}','Autre')">Autre</button>

</div>

`;

}

content.innerHTML=question;

function showAvailability(service, objectif){

bookingData.service=service;
bookingData.objectif=objectif;

const content=document.getElementById("bookingContent");

content.innerHTML=`
...
tout le HTML de tes disponibilités
...
`;

const checks=document.querySelectorAll(".availability-grid input");

checks.forEach(c=>{

c.addEventListener("change",()=>{

const checked=document.querySelectorAll(".availability-grid input:checked");

if(checked.length>3){

c.checked=false;

alert("Vous pouvez sélectionner un maximum de 3 disponibilités.");

}

});

});

}  

}
function showAvailability(service,objectif){

const content=document.getElementById("bookingContent");

content.innerHTML=`

<div class="step">

<h3>Choisissez vos disponibilités</h3>

<p>Vous pouvez sélectionner jusqu'à 3 choix.</p>

<div class="availability-grid">

<label><input type="checkbox"> Lundi 15h00</label>

<label><input type="checkbox"> Lundi 16h00</label>

<label><input type="checkbox"> Mardi 15h00</label>

<label><input type="checkbox"> Mardi 16h00</label>

<label><input type="checkbox"> Mercredi 15h00</label>

<label><input type="checkbox"> Mercredi 16h00</label>

<label><input type="checkbox"> Jeudi 15h00</label>

<label><input type="checkbox"> Jeudi 16h00</label>

<label><input type="checkbox"> Vendredi 16h00</label>

<label><input type="checkbox"> Vendredi 17h00</label>

<label><input type="checkbox"> Vendredi 18h00</label>

<label><input type="checkbox"> Vendredi 19h00</label>

<label><input type="checkbox"> Samedi 8h00</label>

<label><input type="checkbox"> Samedi 9h00</label>

<label><input type="checkbox"> Samedi 10h00</label>

<label><input type="checkbox"> Samedi 11h00</label>

</div>

<button class="hero-btn" style="margin-top:30px;" onclick="showContactForm('${service}','${objectif}')">

Continuer

</button>

</div>

`;

}
function showContactForm(service, objectif){

const content=document.getElementById("bookingContent");

content.innerHTML=`

<div class="step">

<h3>Vos coordonnées</h3>

<p>Remplissez vos informations afin que nous puissions communiquer avec vous.</p>

<input class="booking-input" type="text" placeholder="Nom complet">

<input class="booking-input" type="tel" placeholder="Téléphone">

<input class="booking-input" type="email" placeholder="Courriel">

<p class="booking-note">

⚠️ Ceci est une demande de réservation. Votre rendez-vous sera confirmé après vérification de nos disponibilités.

</p>

<button class="hero-btn" onclick="bookingSuccess()">

Envoyer ma demande

</button>

</div>

`;

}

function bookingSuccess(){

const name=document.querySelector('input[type="text"]').value.trim();
const phone=document.querySelector('input[type="tel"]').value.trim();
const email=document.querySelector('input[type="email"]').value.trim();

if(name==="" || phone==="" || email===""){

alert("Veuillez remplir tous les champs.");

return;

}

const content=document.getElementById("bookingContent");

content.innerHTML=`

<div class="step success">

<h2>✅ Merci !</h2>

<p>

Votre demande a bien été reçue.

</p>

<p>

Nous communiquerons avec vous rapidement afin de confirmer votre rendez-vous.

</p>

<button class="hero-btn" onclick="closeBooking()">

Fermer

</button>

</div>

`;

}
