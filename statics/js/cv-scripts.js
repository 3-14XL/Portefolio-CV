function flipCard() {
    const card =
        document.getElementById("authCard");
    card.classList.toggle("flipped");
}

document.querySelector('.section-experience ul.timeline li::before').insertAdjacentHTML('afterbegin', '<i class="fa-solid fa-briefcase"></i>');

/************************
 * PASSWORD SHOW / HIDE *
 ************************/

function togglePassword(id, button) {
    const input =
        document.getElementById(id);
    if (input.type === "password") {
        input.type = "text";
        button.textContent = "🙈";
    } else {
        input.type = "password";
        button.textContent = "👁";
    }
}

/***************
 * DEMO SUBMIT *
 ***************/

document.querySelectorAll("form").forEach(form => {
    form.addEventListener("submit", function(e) {
        e.preventDefault();
        const button = this.querySelector(".main-btn");
        const oldText = button.textContent;
        button.textContent = "✓ SUCCESS";
        setTimeout(() => {
            button.textContent = oldText;
        }, 1800);
    }
    );
});

/****************
 * 3D Foil Card *
 ****************/

const cards = document.querySelectorAll(".avatar-wrap");

cards.forEach(card => {
    const content = card.querySelector(".avatar");
    const glow = card.querySelector(".glow");

    card.addEventListener("mousemove", e => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const angleY = -((x - rect.width / 2) / (rect.width / 2)) * 10;
        const angleX = ((y - rect.height / 2) / (rect.height / 2)) * 10;

        content.style.transform = `rotateY(${angleY}deg) rotateX(${angleX}deg) scale(1.05)`;
        content.style.boxShadow = `${-angleY * 1.5}px ${angleX * 1.5 + 15}px 30px rgba(0, 0, 0, 0.5)`;

        glow.style.background = `radial-gradient(circle at ${(x / rect.width) * 100}% ${(y / rect.height) * 100}%, rgb(184,196,211), transparent)`;
    
        const px = ((x / rect.width) * 100).toFixed(2);
        const py = ((y / rect.height) * 100).toFixed(2);
        const pFromCenterX = (x - rect.width / 2) / (rect.width / 2);
        const pFromCenterY = (y - rect.height / 2) / (rect.height / 2);
        const pointerFromCenter = Math.min(Math.sqrt(pFromCenterX * pFromCenterX + pFromCenterY * pFromCenterY), 1).toFixed(2);

        card.style.setProperty("--pointer-x", `${px}%`);
        card.style.setProperty("--pointer-y", `${py}%`);
        card.style.setProperty("--pointer-from-center", pointerFromCenter);
        card.style.setProperty("--pointer-from-left", `${x / rect.width}`);
        card.style.setProperty("--pointer-from-top", `${y / rect.height}`);
        
        const translateX = (pFromCenterX * 50).toFixed(2);
        const translateY = (pFromCenterY * 50).toFixed(2);
        card.style.setProperty("--translate-x", `${translateX}%`);
        card.style.setProperty("--translate-y", `${translateY}%`);

        const foilContainer = card.querySelector(".foil-container");
        const foilImg = card.querySelector(".foil-img");
        
        if (foilContainer && foilImg) {
            foilContainer.style.webkitMaskImage = `radial-gradient(circle 180px at ${px}% ${py}%, black 0%, transparent 100%), url("../statics/images/mask6.png")`;
            foilContainer.style.maskImage = `radial-gradient(circle 180px at ${px}% ${py}%, black 0%, transparent 100%), url("../statics/images/mask6.png")`;
            foilContainer.style.webkitMaskComposite = `source-in`;
            foilContainer.style.maskComposite = `intersect`;

            foilImg.style.opacity = (0.05 + (pointerFromCenter * 0.1)).toFixed(2);
        }
    });

    card.addEventListener("mouseleave", () => {
        content.style.transform = "rotateY(0deg) rotateX(0deg) scale(1)";
        content.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.3)";

        glow.style.background = "radial-gradient(circle at 50% 0%, rgb(184, 196, 211), transparent)";

        card.style.setProperty("--pointer-x", "50%");
        card.style.setProperty("--pointer-y", "50%");
        card.style.setProperty("--pointer-from-center", "0.5");
        card.style.setProperty("--translate-x", "0%");
        card.style.setProperty("--translate-y", "0%");

        const foilContainer = card.querySelector(".foil-container");
        const foilImg = card.querySelector(".foil-img");
        if (foilContainer && foilImg) {
            foilImg.style.opacity = "0";
            foilContainer.style.maskImage = `url("../statics/images/mask6.png")`;
            foilContainer.style.webkitMaskImage = `url("../statics/images/mask6.png")`;
        }
    });
});