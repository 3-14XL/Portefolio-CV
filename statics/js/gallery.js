/* Galerie 3D de la section Projets : spirale, rotation libre, dérive lente, titre animé.
   Données : GET /api/projects (voir main.go). Styles : statics/css/gallery.css. */
(() => {
    'use strict';

    /* ---------- Configuration ---------- */
    const CONFIG = {
        endpoint: '/api/projects',
        cardW: 300,             // largeur d'une carte (px)
        cardH: 400,             // hauteur d'une carte (px)
        gap: 30,                // espace horizontal entre deux cartes sur le cercle (px)
        step: 0.52,             // angle entre deux cartes (radians) : plus petit = spirale plus serrée
        pitch: 64,              // décalage vertical entre deux cartes (px) : la « montée » de l'hélice
        wheelPerCard: 100,      // delta de molette horizontale pour avancer d'une carte
        orbitSpeed: 0.006,      // rotation en radians par pixel glissé
        pitchLimit: 0.45,       // inclinaison verticale maximale (radians) ; la rotation horizontale reste libre
        orbitReturn: true,      // la galerie revient face à l'écran après avoir été lâchée
        orbitReturnDelay: 1200, // ms avant ce retour
        autoplay: true,         // défilement automatique lent quand personne n'interagit
        autoSpeed: 0.35,        // vitesse de dérive, en cartes par seconde
        idleDelay: 1800,        // ms sans interaction avant que la dérive reprenne
        titleOut: 420,          // ms : sortie d'une lettre du titre (vers le haut)
        titleIn: 650,           // ms : entrée d'une lettre du titre (depuis le bas)
        titleStagger: 28,       // ms de décalage entre deux lettres
        titleEasing: 'cubic-bezier(.76, 0, .24, 1)'
    };

    const TAU = Math.PI * 2;

    const gallery = document.getElementById('tg');
    if (!gallery) return;
    const stage = document.getElementById('tg-stage');
    const capTitle = document.getElementById('tg-title');
    const capTitleSr = document.getElementById('tg-title-sr');
    const capSub = document.getElementById('tg-sub');
    const numInput = document.getElementById('tg-num');
    const total = document.getElementById('tg-total');
    const hint = document.getElementById('tg-hint');

    /* ---------- Validation des données reçues ---------- */
    // Seules les URL http(s) (ou les chemins du site) sont acceptées pour les liens.
    function safeHttpUrl(raw) {
        if (typeof raw !== 'string' || raw.trim() === '') return null;
        try {
            const u = new URL(raw, window.location.origin);
            return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
        } catch (_) {
            return null;
        }
    }
    // Classes Font Awesome : lettres, chiffres, espaces et tirets uniquement.
    function safeIcon(v, fallback) {
        return (typeof v === 'string' && /^[a-z0-9 -]{1,60}$/i.test(v)) ? v : fallback;
    }
    function normalize(d) {
        const list = (v) => Array.isArray(v) ? v : [];
        return {
            title: String(d?.title ?? ''),
            subtitle: String(d?.subtitle ?? ''),
            description: String(d?.description ?? ''),
            icon: safeIcon(d?.icon, 'fas fa-code'),
            tech: list(d?.tech).map(String),
            links: list(d?.links).map((l) => ({
                label: String(l?.label ?? ''),
                icon: safeIcon(l?.icon, 'fas fa-external-link-alt'),
                url: safeHttpUrl(l?.url)
            })).filter((l) => l.url)
        };
    }

    async function load() {
        try {
            const res = await fetch(CONFIG.endpoint, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) throw new Error('liste vide');
            init(data.map(normalize));
        } catch (err) {
            hint.textContent = 'Impossible de charger les projets (' + err.message + '). Lance le site avec « go run main.go ».';
        }
    }

    /* ---------- Construction d'une carte ---------- */
    const el = (tag, cls, text) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    };

    function buildCard(item, i, N) {
        const card = el('div', 'tg-card');
        card.setAttribute('role', 'group');
        card.setAttribute('aria-roledescription', 'diapositive');
        card.setAttribute('aria-label', (i + 1) + ' sur ' + N);

        const front = el('div', 'tg-face tg-front');

        const image = el('div', 'project-image');
        const icon = el('i', 'project-icon ' + item.icon);
        icon.setAttribute('aria-hidden', 'true');
        image.append(icon);

        const content = el('div', 'project-content');
        content.append(el('h3', 'project-title', item.title), el('p', 'project-desc', item.description));

        const stack = el('div', 'tech-stack');
        item.tech.forEach((t) => stack.append(el('span', 'tech-tag', t)));
        content.append(stack);

        if (item.links.length) {
            const links = el('div', 'project-links');
            item.links.forEach((l) => {
                const a = el('a');
                a.href = l.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.title = l.label;
                a.draggable = false;
                a.setAttribute('aria-label', (l.label || 'Lien') + ' : ' + item.title);
                const ic = el('i', 'link-icon ' + l.icon);
                ic.setAttribute('aria-hidden', 'true');
                a.append(ic);
                links.append(a);
            });
            content.append(links);
        }

        front.append(image, content);
        card.append(front, el('div', 'tg-face tg-back'));
        return card;
    }

    function init(items) {
        const N = items.length;
        const R = (CONFIG.cardW + CONFIG.gap) / CONFIG.step;   // rayon du cylindre
        gallery.style.setProperty('--tg-w', CONFIG.cardW + 'px');
        gallery.style.setProperty('--tg-h', CONFIG.cardH + 'px');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        /* ---------- État ---------- */
        let p = 0;                        // position affichée le long de l'hélice (index flottant)
        let target = 0;                   // position visée
        let yaw = 0, pitch = 0;           // orientation libre affichée (radians)
        let yawT = 0, pitchT = 0;         // orientation visée
        let yawV = 0, pitchV = 0;         // vitesses d'inertie (rad/s)
        let returning = false;
        let dragging = false;
        let dragMoved = 0;
        let lastX = 0, lastY = 0, lastT = 0;
        let activeIndex = -1;
        let lastInput = performance.now();
        let lastOrbit = performance.now();
        let playing = CONFIG.autoplay && !reduceMotion;
        let autoDir = 1;
        let visible = true;               // la galerie est-elle à l'écran ?

        const clamp = (v) => Math.max(0, Math.min(N - 1, v));
        const clampPitch = (v) => Math.max(-CONFIG.pitchLimit, Math.min(CONFIG.pitchLimit, v));
        function goTo(i) { target = clamp(i); lastInput = performance.now(); }
        function resetOrbit() {
            yawT = Math.round(yawT / TAU) * TAU;      // plus court chemin : pas de tours inutiles
            pitchT = Math.round(pitchT / TAU) * TAU;
            yawV = pitchV = 0;
        }

        /* ---------- Légende animée (titre lettre par lettre + sous-titre) ---------- */
        let shownTitle = null;
        let pendingCaption = null;
        let captionBusy = false;

        function buildChars(text) {
            capTitle.textContent = '';
            return Array.from(text).map((c) => {
                const mask = el('span', 'tg-ch');
                const inner = el('span', 'tg-ch-in', c === ' ' ? ' ' : c);
                mask.appendChild(inner);
                capTitle.appendChild(mask);
                return inner;
            });
        }
        function slideChars(chars, from, to, duration) {
            return Promise.all(chars.map((c, i) => c.animate(
                [{ transform: 'translateY(' + from + ')' }, { transform: 'translateY(' + to + ')' }],
                { duration, delay: i * CONFIG.titleStagger, easing: CONFIG.titleEasing, fill: 'both' }
            ).finished));
        }
        function fadeSub(from, to, duration) {
            return capSub.animate(
                [{ opacity: from, transform: 'translateY(' + (from === 0 ? '8px' : '0') + ')' },
                 { opacity: to, transform: 'translateY(' + (to === 0 ? '-8px' : '0') + ')' }],
                { duration, easing: CONFIG.titleEasing, fill: 'both' }
            ).finished;
        }
        // Si plusieurs changements arrivent pendant une animation, seul le dernier est affiché ensuite.
        async function setCaption(title, subtitle) {
            pendingCaption = { title, subtitle };
            if (captionBusy) return;
            captionBusy = true;
            try {
                while (pendingCaption) {
                    const next = pendingCaption;
                    pendingCaption = null;
                    if (next.title === shownTitle) { capSub.textContent = next.subtitle; continue; }
                    capTitleSr.textContent = next.title;           // texte lu par les lecteurs d'écran

                    if (reduceMotion) {
                        buildChars(next.title);
                        capSub.textContent = next.subtitle;
                        shownTitle = next.title;
                        continue;
                    }
                    if (shownTitle !== null) {                      // sortie : les lettres montent et disparaissent
                        const old = Array.from(capTitle.querySelectorAll('.tg-ch-in'));
                        await Promise.all([
                            slideChars(old, '0', '-115%', CONFIG.titleOut),
                            fadeSub(1, 0, CONFIG.titleOut)
                        ]);
                    }
                    capSub.textContent = next.subtitle;
                    const fresh = buildChars(next.title);           // entrée : les lettres montent depuis le bas
                    await Promise.all([
                        slideChars(fresh, '115%', '0', CONFIG.titleIn),
                        fadeSub(0, 1, CONFIG.titleIn)
                    ]);
                    shownTitle = next.title;
                }
            } catch (_) {
                if (pendingCaption) { capTitle.textContent = pendingCaption.title; capSub.textContent = pendingCaption.subtitle; }
            } finally {
                captionBusy = false;
            }
        }

        /* ---------- Cartes ---------- */
        const cards = items.map((item, i) => {
            const card = buildCard(item, i, N);
            card.style.transform = 'translateY(' + ((i - (N - 1) / 2) * CONFIG.pitch) + 'px)' +
                ' rotateY(' + (i * CONFIG.step) + 'rad) translateZ(' + R + 'px)';
            card.addEventListener('click', () => {
                if (dragMoved > 6) return;                          // un glissement n'est pas un clic
                goTo(i);
            });
            stage.appendChild(card);
            return card;
        });

        // Seule la carte active est exposée aux lecteurs d'écran et à la tabulation.
        function setActiveState(idx) {
            cards.forEach((c, k) => {
                const on = k === idx;
                c.classList.toggle('active', on);
                c.setAttribute('aria-hidden', on ? 'false' : 'true');
                c.querySelectorAll('a').forEach((a) => { a.tabIndex = on ? 0 : -1; });
            });
        }

        /* ---------- Rendu ---------- */
        function render() {
            const w = gallery.clientWidth, hh = gallery.clientHeight;
            const s = Math.min(1, w / (CONFIG.cardW * 1.25));      // sur petit écran : une carte lisible, les voisines dépassent
            const ty = -(p - (N - 1) / 2) * CONFIG.pitch;
            stage.style.transform =
                'scale(' + s + ') translateZ(' + (-R) + 'px) rotateX(' + pitch + 'rad) rotateY(' + yaw + 'rad)' +
                ' translateY(' + ty + 'px) rotateY(' + (-p * CONFIG.step) + 'rad)';

            // Opacité selon la position réelle de chaque carte (profondeur, hauteur à l'écran)
            const cy = Math.cos(yaw), sy = Math.sin(yaw);
            const cp = Math.cos(pitch), sp = Math.sin(pitch);
            const vh = hh / s;
            for (let i = 0; i < N; i++) {
                const d = i - p;
                const a = d * CONFIG.step;
                const x = R * Math.sin(a), z = R * Math.cos(a), y = d * CONFIG.pitch;
                const z1 = -x * sy + z * cy;
                const y2 = y * cp - z1 * sp;
                const z2 = y * sp + z1 * cp;
                const depth = Math.max(0, Math.min(1, (z2 / R + 1) / 2));
                const vfade = Math.max(0, 1 - Math.abs(y2) / (vh * 0.55));
                cards[i].querySelectorAll('.tg-face').forEach((f) => f.style.setProperty('--o', ((0.12 + 0.88 * depth) * vfade).toFixed(3)));
            }

            const near = Math.round(p);
            if (near !== activeIndex) {
                activeIndex = near;
                setActiveState(near);
                if (document.activeElement !== numInput) numInput.value = String(near + 1);
                setCaption(items[near].title, items[near].subtitle);
            }
        }

        /* ---------- Boucle d'animation ---------- */
        let last = performance.now();
        let lastP = NaN, lastYaw = NaN, lastPitch = NaN;
        function tick(now) {
            if (!visible) { last = now; requestAnimationFrame(tick); return; }   // rien à animer hors écran
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;

            // Pas de dérive pendant une saisie ou quand un lien de la carte a le focus
            const ae = document.activeElement;
            if (ae === numInput || (ae && ae.tagName === 'A' && gallery.contains(ae))) lastInput = now;

            // 1) Avancer le long de l'hélice : dérive lente, ou aimantation sur la carte la plus proche
            if (!dragging) {
                const idle = now - lastInput;
                if (playing && idle > CONFIG.idleDelay) {
                    target += autoDir * CONFIG.autoSpeed * dt;
                    if (target >= N - 1) { target = N - 1; autoDir = -1; }
                    else if (target <= 0) { target = 0; autoDir = 1; }
                } else if (idle > 140) {
                    target = Math.round(target);
                }
            }

            // 2) Orientation libre : inertie après le lâcher, puis retour face à l'écran
            returning = false;
            if (!dragging) {
                if (Math.abs(yawV) > 0.05 || Math.abs(pitchV) > 0.05) {
                    yawT += yawV * dt;
                    const np = pitchT + pitchV * dt;
                    pitchT = clampPitch(np);
                    if (pitchT !== np) pitchV = 0;
                    const f = Math.pow(0.04, dt);
                    yawV *= f; pitchV *= f;
                } else {
                    yawV = pitchV = 0;
                    if (CONFIG.orbitReturn && now - lastOrbit > CONFIG.orbitReturnDelay) {
                        resetOrbit();
                        returning = true;
                    }
                }
            }

            // 3) Lissage vers les valeurs visées
            const k = reduceMotion ? 1 : 1 - Math.pow(0.0008, dt);
            const ko = reduceMotion ? 1 : 1 - Math.pow(returning ? 0.02 : 0.0008, dt);
            p += (target - p) * k;
            yaw += (yawT - yaw) * ko;
            pitch += (pitchT - pitch) * ko;
            if (Math.abs(target - p) < 0.0005) p = target;
            if (Math.abs(yawT - yaw) < 0.0005) yaw = yawT;
            if (Math.abs(pitchT - pitch) < 0.0005) pitch = pitchT;

            if (p !== lastP || yaw !== lastYaw || pitch !== lastPitch) {
                render();
                lastP = p; lastYaw = yaw; lastPitch = pitch;
            }
            requestAnimationFrame(tick);
        }

        /* ---------- Entrées : attraper et faire tourner ---------- */
        gallery.addEventListener('pointerdown', (e) => {
            if (document.activeElement === numInput && e.target !== numInput) numInput.blur();   // valide la saisie
            if (e.target.closest('.tg-controls')) return;
            dragging = true;
            dragMoved = 0;
            yawV = pitchV = 0;
            lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
            lastInput = lastOrbit = lastT;
            gallery.classList.add('dragging');
        });
        window.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - lastX, dy = e.clientY - lastY;
            const now = performance.now();
            const dtm = Math.max(1, now - lastT) / 1000;
            dragMoved += Math.abs(dx) + Math.abs(dy);
            const dYaw = dx * CONFIG.orbitSpeed;
            const dPitch = -dy * CONFIG.orbitSpeed;
            yawT += dYaw;
            const np = pitchT + dPitch;
            pitchT = clampPitch(np);
            yawV = yawV * 0.6 + (dYaw / dtm) * 0.4;
            pitchV = pitchT !== np ? 0 : pitchV * 0.6 + (dPitch / dtm) * 0.4;
            lastX = e.clientX; lastY = e.clientY; lastT = now;
            lastInput = lastOrbit = now;
        });
        function endDrag() {
            if (!dragging) return;
            dragging = false;
            gallery.classList.remove('dragging');
            const now = performance.now();
            if (now - lastT > 80) { yawV = 0; pitchV = 0; }
            const cap = (v) => Math.max(-8, Math.min(8, v));
            yawV = cap(yawV); pitchV = cap(pitchV);
            lastInput = lastOrbit = now;
            setTimeout(() => { dragMoved = 0; }, 0);                // après le clic éventuel qui suit le relâchement
        }
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);

        // Un glissement qui finit sur un lien ou une carte ne doit ni ouvrir le lien ni choisir la carte.
        gallery.addEventListener('click', (e) => {
            if (dragMoved > 6) { e.preventDefault(); e.stopPropagation(); }
        }, true);
        // Empêche le glisser-déposer natif des liens et images, qui interromprait la rotation.
        gallery.addEventListener('dragstart', (e) => e.preventDefault());

        /* ---------- Molette, clavier, boutons ---------- */
        // Seul le défilement horizontal (trackpad, Maj + molette) avance la galerie :
        // la molette verticale continue de faire défiler la page.
        gallery.addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            e.preventDefault();
            const unit = e.deltaMode === 1 ? 33 : 1;
            lastInput = performance.now();
            target = clamp(target + (e.deltaX * unit) / CONFIG.wheelPerCard);
        }, { passive: false });

        // Le clavier ne s'applique que lorsque la galerie a le focus : la page garde ses flèches.
        gallery.addEventListener('keydown', (e) => {
            if (e.target === numInput) {
                if (e.key === 'Enter') numInput.blur();                                     // le blur valide la saisie
                else if (e.key === 'Escape') { numInput.value = String(Math.round(p) + 1); numInput.blur(); }
                return;
            }
            if (e.altKey || e.ctrlKey || e.metaKey) return;                                 // laisse passer Alt+← (retour), etc.
            const cur = Math.round(p);                                                      // la carte que l'on voit, pas la position visée
            switch (e.key) {
                case 'ArrowRight': case 'ArrowDown': goTo(cur + 1); break;
                case 'ArrowLeft': case 'ArrowUp': goTo(cur - 1); break;
                case 'Home': goTo(0); resetOrbit(); break;
                case 'End': goTo(N - 1); break;
                default: return;
            }
            e.preventDefault();
        });
        document.getElementById('tg-prev').addEventListener('click', () => goTo(Math.round(p) - 1));
        document.getElementById('tg-next').addEventListener('click', () => goTo(Math.round(p) + 1));

        // Pause / lecture du défilement automatique
        const autoBtn = document.getElementById('tg-auto');
        if (!CONFIG.autoplay || reduceMotion) {
            autoBtn.hidden = true;
        } else {
            const syncAutoBtn = () => {
                autoBtn.textContent = playing ? '⏸' : '▶';
                autoBtn.setAttribute('aria-pressed', String(!playing));
                autoBtn.setAttribute('aria-label',
                    playing ? 'Mettre en pause le défilement automatique' : 'Reprendre le défilement automatique');
            };
            autoBtn.addEventListener('click', () => {
                playing = !playing;
                lastInput = performance.now();
                syncAutoBtn();
            });
            syncAutoBtn();
        }

        // Numéro de la carte active : modifiable à la main (1 à N)
        total.textContent = '/ ' + N;
        numInput.maxLength = String(N).length;
        numInput.setAttribute('aria-label', 'Numéro du projet actif, sur ' + N);
        const showCurrent = () => { numInput.value = String(Math.round(target) + 1); };   // après goTo : la carte visée
        numInput.addEventListener('focus', () => { lastInput = performance.now(); numInput.select(); });
        numInput.addEventListener('input', () => {
            numInput.value = numInput.value.replace(/\D/g, '');
            lastInput = performance.now();
        });
        numInput.addEventListener('blur', () => {
            const v = parseInt(numInput.value, 10);
            if (Number.isFinite(v)) goTo(v - 1);
            showCurrent();
        });

        window.addEventListener('resize', () => { lastP = NaN; });
        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                visible = entries[entries.length - 1].isIntersecting;
                if (visible) lastInput = performance.now();         // la dérive repart doucement quand on revient sur la galerie
            }).observe(gallery);
        }

        render();
        requestAnimationFrame(tick);
    }

    load();
})();
