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
