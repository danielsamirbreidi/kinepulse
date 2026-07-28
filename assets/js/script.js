const observer = new IntersectionObserver((entries)=>{

entries.forEach(entry=>{

if(entry.isIntersecting){

entry.target.classList.add("show");

}

});

});

document.querySelectorAll(".service-card").forEach(el=>{

el.classList.add("fade-up");

observer.observe(el);

});

document.querySelectorAll(".why-grid div").forEach(el=>{

el.classList.add("fade-up");

observer.observe(el);

});
