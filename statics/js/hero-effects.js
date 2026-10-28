document.addEventListener("DOMContentLoaded", () => {
    const hero = document.querySelector(".hero");

    // Paper in animation
    const paperTitle = document.querySelector(".hero h1 .paper-title");
    if (paperTitle) {
        const title = paperTitle.textContent;
        const shadow = document.createElement("span");
        shadow.className = "paper-title-shadow";
        shadow.setAttribute("aria-hidden", "true");

        const letters = Array.from(title, (character, index) => {
            const letter = document.createElement("span");
            letter.className = "paper-title-letter";
            letter.style.setProperty("--letter-index", index);
            letter.textContent = character;

            const shadowLetter = document.createElement("span");
            shadowLetter.className = "paper-shadow-letter";
            shadowLetter.style.setProperty("--letter-index", index);
            shadowLetter.textContent = character;
            shadow.append(shadowLetter);

            return letter;
        });
        paperTitle.replaceChildren(shadow, ...letters);
    }

    // Glitch animation
    const glitchElements = document.querySelectorAll(".hero h1 .glitch");
    glitchElements.forEach(el => {
        el.setAttribute("data-text", el.textContent.trim());
        const reservedHeight = el.getBoundingClientRect().height;
        if (reservedHeight > 0) el.style.minHeight = `${reservedHeight}px`;
        el.classList.remove("glitch");
        el.classList.add("waiting-for-title");

        const startIntro = () => {
            const textBox = el.getBoundingClientRect();
            el.style.setProperty("--glitch-layout-width", `${textBox.width}px`);
            el.style.setProperty("--glitch-layout-height", `${textBox.height}px`);
            el.classList.remove("waiting-for-title");
            el.classList.add("light-dot");
            window.setTimeout(() => {
                el.classList.remove("light-dot");
                el.classList.add("glitch", "glitch-appear");
                el.addEventListener("animationend", event => {
                    if (event.target !== el || event.animationName !== "hero-glitch-appear") return;
                    el.classList.remove("glitch-appear");
                    el.dispatchEvent(new CustomEvent("hero-glitch-intro-end"));
                });
            }, 150);
        };

        const lastTitleLetter = document.querySelector(".hero h1 .paper-title-letter:last-child");
        if (lastTitleLetter && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            lastTitleLetter.addEventListener("animationend", startIntro, { once: true });
        } else {
            startIntro();
        }
    });

    // Lock height hero during animations
    if (hero) {
        const lockHeroHeight = () => {
            hero.style.height = "auto";
            hero.style.height = `${hero.getBoundingClientRect().height}px`;
        };

        lockHeroHeight();
        window.addEventListener("resize", lockHeroHeight);
    }
});

// Typewriting effect
document.addEventListener("DOMContentLoaded", () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const typeTextNode = (node, onComplete, keepCursor = false) => {
        const text = node.textContent;
        const paragraph = node.parentElement.closest(".hero > p");
        if (paragraph) {
            paragraph.style.minHeight = `${paragraph.getBoundingClientRect().height}px`;
        }
        const cursor = document.createElement("span");
        cursor.className = "typing-cursor";
        cursor.setAttribute("aria-hidden", "true");
        node.textContent = "";
        node.parentNode.insertBefore(cursor, node.nextSibling);
        let position = 0;

        const typeNextCharacter = () => {
            node.textContent += text[position++];
            if (position < text.length) {
                window.setTimeout(typeNextCharacter, 32);
                return;
            }
            if (!keepCursor) cursor.remove();
            if (onComplete) onComplete();
            if (keepCursor) window.setTimeout(() => cursor.remove(), 700);
        };
        typeNextCharacter();
    };

    const heroParagraphs = document.querySelectorAll(".hero > p");
    const paperTitle = document.querySelector(".hero h1 .paper-title");
    if (heroParagraphs.length >= 2 && paperTitle) {
        const delayedCopy = document.querySelector(".hero > p.hero-delayed-copy");
        typeTextNode(heroParagraphs[0].firstChild, () => {
            const glitchTitle = document.querySelector(".hero h1 .glitch, .hero h1 .waiting-for-title");
            if (!glitchTitle) {
                delayedCopy?.classList.add("typing-active");
                typeTextNode(heroParagraphs[1].firstChild, null, true);
                return;
            }
            glitchTitle.addEventListener("hero-glitch-intro-end", () => {
                window.setTimeout(() => {
                    delayedCopy?.classList.add("typing-active");
                    typeTextNode(heroParagraphs[1].firstChild, null, true);
                }, 250);
            }, { once: true });
            paperTitle.classList.add("animate-in");
        });
    }

    const textNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            return node.textContent.trim()
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        }
    });

    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest(".hero > p, .logo")) continue;
        const font = getComputedStyle(node.parentElement).fontFamily.toLowerCase();
        if (/monospace|jetbrains mono|fira code/.test(font)) textNodes.push(node);
    }

    textNodes.forEach((node, index) => {
        window.setTimeout(() => typeTextNode(node, null, true), index * 120);
    });
});
