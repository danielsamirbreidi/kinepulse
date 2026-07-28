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
