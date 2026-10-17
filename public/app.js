document.addEventListener('DOMContentLoaded', () => {
    const csrfHeader = () => {
        const token = document.cookie.split('; ').find(cookie => cookie.startsWith('csrf_token='))?.split('=').slice(1).join('=');
        return token ? { 'X-CSRF-Token': decodeURIComponent(token) } : {};
    };
    // Load the published content document so the admin editor can update the live site.
    const createContactLine = (icon, value, href) => {
        const line = document.createElement('p');
        const iconElement = document.createElement('i');
        iconElement.className = icon.includes(' ') ? icon : `fa-solid ${icon}`;
        iconElement.setAttribute('aria-hidden', 'true');
        line.append(iconElement, ' ');
        if (href) {
            const link = document.createElement('a');
            link.href = href;
            link.textContent = value;
            line.append(link);
        } else {
            line.append(document.createTextNode(value));
        }
        return line;
    };
    const renderServices = services => {
        const grid = document.querySelector('.services-grid');
        if (!grid || !Array.isArray(services)) return;
        grid.replaceChildren();
        services.forEach(service => {
            const card = document.createElement('div');
            card.className = 'service-card';
            const icon = document.createElement('i');
            icon.className = `fa-solid ${service.icon || 'fa-solar-panel'}`;
            const title = document.createElement('h3');
            title.textContent = service.title || 'Service';
            const description = document.createElement('p');
            description.textContent = service.description || '';
            card.append(icon, title, description);
            grid.append(card);
        });
    };
    const renderProjects = projects => {
        const body = document.querySelector('.projects-table tbody');
        if (!body || !Array.isArray(projects)) return;
        body.replaceChildren();
        projects.forEach(project => {
            const row = document.createElement('tr');
            [project.description, project.client, project.value, project.year].forEach(value => {
                const cell = document.createElement('td');
                cell.textContent = value || '';
                row.append(cell);
            });
            body.append(row);
        });
    };
    const renderContact = (brand, contact) => {
        const footer = document.querySelector('.footer-col');
        if (!footer || !contact) return;
        const heading = footer.querySelector('h3');
        if (heading && brand?.name) heading.textContent = brand.name;
        const tagline = footer.querySelector('p');
        if (tagline && brand?.tagline) tagline.textContent = brand.tagline;
        const lines = [
            createContactLine('fa-location-dot', contact.address || '', null),
            createContactLine('fa-envelopes-bulk', contact.poBox || '', null),
            createContactLine('fa-envelope', contact.email || '', contact.email ? `mailto:${contact.email}` : null),
            createContactLine('fa-phone', contact.phone || '', contact.phone ? `tel:${contact.phone.split('/')[0].replace(/[^+\d]/g, '')}` : null),
            createContactLine('fa-brands fa-whatsapp', 'WhatsApp us', contact.whatsapp ? `https://wa.me/${contact.whatsapp.replace(/\D/g, '')}` : null),
            createContactLine('fa-globe', contact.website || '', contact.website ? `https://${contact.website.replace(/^https?:\/\//, '')}` : null)
        ];
        footer.querySelectorAll('p:not(:first-of-type)').forEach(line => line.remove());
        lines.forEach(line => footer.append(line));
    };
    fetch('/api/site-content').then(response => response.ok ? response.json() : null).then(payload => {
        const content = payload?.content;
        if (!content) return;
        const setText = (selector, value) => { const element = document.querySelector(selector); if (element && typeof value === 'string') element.textContent = value; };
        if (content.brand?.logoUrl) document.querySelectorAll('.site-logo').forEach(image => image.src = content.brand.logoUrl);
        setText('.hero-eyebrow', content.hero?.eyebrow);
        setText('.hero-content h1', content.hero?.title);
        setText('.hero-content > p', content.hero?.description);
        renderContact(content.brand, content.contact);
        renderServices(content.services);
        renderProjects(content.projects);
        attachServiceActions();
        filterProjects();
    }).catch(() => {});

    // PRELOADER ANIMATION SEQUENCE
    const preloader = document.getElementById('preloader');
    const mainContent = document.getElementById('main-content');
    const targetBulb = document.getElementById('targetBulb');
    const brandReveal = document.querySelector('.anim-brand-reveal');
    const animMotto = document.querySelector('.anim-motto');
    const isHomePage = /(?:^|\/)index\.html$/.test(window.location.pathname) || window.location.pathname.endsWith('/');
    const navigationEntry = window.performance.getEntriesByType('navigation')[0];
    const isHomeRefresh = navigationEntry?.type === 'reload';
    const shouldPlayPreloader = Boolean(preloader && isHomePage && (isHomeRefresh || !window.sessionStorage.getItem('aqua-solar-preloader-seen')));

    if (shouldPlayPreloader) {
        window.sessionStorage.setItem('aqua-solar-preloader-seen', 'true');
    } else if (preloader) {
        preloader.remove();
        mainContent?.classList.remove('hidden-content');
        mainContent?.classList.add('visible-content');
    }

    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.main-nav');
    const themeToggle = document.querySelector('.theme-toggle');
    const savedTheme = window.localStorage.getItem('aqua-solar-theme');

    // Keep the admin editor easy to reach from every public page.
    nav?.querySelector('ul')?.insertAdjacentHTML('beforeend', '<li><a class="admin-link" href="admin.html"><i class="fa-solid fa-lock" aria-hidden="true"></i> Admin</a></li>');

    function setTheme(theme) {
        const dark = theme === 'dark';
        document.documentElement.classList.toggle('dark-theme', dark);
        if (!themeToggle) return;
        themeToggle.setAttribute('aria-pressed', String(dark));
        themeToggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
        themeToggle.querySelector('span').textContent = dark ? 'Light mode' : 'Dark mode';
        themeToggle.querySelector('i').className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        window.localStorage.setItem('aqua-solar-theme', dark ? 'dark' : 'light');
    }

    setTheme(savedTheme === 'dark' ? 'dark' : 'light');
    themeToggle?.addEventListener('click', () => {
        setTheme(document.documentElement.classList.contains('dark-theme') ? 'light' : 'dark');
    });

    navToggle?.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', String(isOpen));
        navToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });
    nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
        nav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
    }));

    // Make the contact details in every footer actionable as well as the top bar.
    document.querySelectorAll('.footer-col p').forEach(contact => {
        const text = contact.textContent.trim();
        if (text.includes('aquasolart@gmail.com') && !contact.querySelector('a')) {
            contact.innerHTML = '<i class="fa-solid fa-envelope"></i> <a href="mailto:aquasolart@gmail.com">aquasolart@gmail.com</a>';
        }
        if (text.includes('+254 741 276241') && !contact.querySelector('a')) {
            contact.innerHTML = '<i class="fa-solid fa-phone"></i> <a href="tel:+254741276241">+254 741 276241</a> / <a href="tel:+254720121155">+254 720 121155</a>';
            if (!contact.parentElement.querySelector('.footer-whatsapp-row')) {
                const whatsappRow = document.createElement('p');
                whatsappRow.className = 'footer-whatsapp-row';
                whatsappRow.innerHTML = '<i class="fa-brands fa-whatsapp"></i> <a class="footer-whatsapp-link" href="https://wa.me/254727896351" target="_blank" rel="noopener" aria-label="Chat with Aqua Solar Technologies on WhatsApp">WhatsApp us</a>';
                contact.insertAdjacentElement('afterend', whatsappRow);
            }
        }
    });

    // Persistent WhatsApp contact action using the primary company number.
    if (!document.querySelector('.whatsapp-float')) {
        const whatsapp = document.createElement('a');
        whatsapp.className = 'whatsapp-float';
        whatsapp.href = 'https://wa.me/254727896351?text=Hello%20Aqua%20Solar%20Technologies%2C%20I%20would%20like%20to%20make%20an%20inquiry.';
        whatsapp.target = '_blank';
        whatsapp.rel = 'noopener';
        whatsapp.setAttribute('aria-label', 'Chat with Aqua Solar Technologies on WhatsApp');
        whatsapp.innerHTML = '<i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp us</span>';
        document.body.append(whatsapp);
    }

    // Turn every service card into a direct quote action.
    const quoteService = document.getElementById('qService');
    const quoteFormBox = document.querySelector('.quote-form-box');
    const serviceToQuoteOption = {
        'Solar Solutions': 'Solar PV System',
        'Borehole Drilling & Water': 'Borehole Drilling',
        'Steel Tanks & Towers': 'Steel Water Tower & Tanks',
        'Electrical Engineering': 'Electrical Engineering',
        'Hydrological Survey': 'Hydrological Survey',
        'Building & Roads': 'Building & Roads',
        'Swimming Pools': 'Swimming Pools',
        'Generator Services': 'Generator Services'
    };
    function attachServiceActions() {
        if (!quoteService || !quoteFormBox) return;
        document.querySelectorAll('.service-card').forEach(card => {
            card.querySelector('.service-action')?.remove();
            const serviceName = card.querySelector('h3')?.textContent.trim();
            if (!serviceName) return;
            const matchingValue = serviceToQuoteOption[serviceName] || serviceName;
            if (![...quoteService.options].some(option => option.value === matchingValue)) {
                quoteService.append(new Option(serviceName, matchingValue));
            }
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'service-action';
            action.textContent = 'Request this service';
            action.addEventListener('click', () => {
                quoteService.value = matchingValue;
                quoteService.dispatchEvent(new Event('change', { bubbles: true }));
                quoteFormBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                quoteFormBox.classList.remove('quote-form-box--attention');
                void quoteFormBox.offsetWidth;
                quoteFormBox.classList.add('quote-form-box--attention');
                window.setTimeout(() => quoteFormBox.classList.remove('quote-form-box--attention'), 1100);
                window.setTimeout(() => document.getElementById('qName').focus({ preventScroll: true }), 500);
            });
            card.append(action);
        });
    }
    attachServiceActions();

    // Run animation steps
    if (shouldPlayPreloader && targetBulb) setTimeout(() => targetBulb.classList.add('lit'), 3200);

    if (shouldPlayPreloader) setTimeout(() => {
        brandReveal?.classList.add('show');
        animMotto?.classList.add('show');
    }, 3600);

    // Fade out preloader and show main page smoothly
    if (shouldPlayPreloader) setTimeout(() => {
        if (preloader) {
            preloader.style.opacity = '0';
            preloader.style.visibility = 'hidden';
        }
        mainContent?.classList.remove('hidden-content');
        mainContent?.classList.add('visible-content');
    }, 5200);

    // DAY / NIGHT HERO SLIDER & REVOLVING TOGGLE WIDGET
    const heroDay = document.getElementById('heroDay');
    const heroNight = document.getElementById('heroNight');
    const heroSection = document.querySelector('.hero-section');
    const btnMorning = document.getElementById('btnMorning');
    const btnNight = document.getElementById('btnNight');

    function switchToDay() {
        if (!heroDay || !heroNight || !heroSection || !btnMorning || !btnNight) return;
        heroDay.classList.add('active');
        heroNight.classList.remove('active');
        heroSection.classList.remove('night-active');
        btnMorning.classList.add('active');
        btnNight.classList.remove('active');
    }

    function switchToNight() {
        if (!heroDay || !heroNight || !heroSection || !btnMorning || !btnNight) return;
        heroNight.classList.add('active');
        heroDay.classList.remove('active');
        heroSection.classList.add('night-active');
        btnNight.classList.add('active');
        btnMorning.classList.remove('active');
    }

    btnMorning?.addEventListener('click', switchToDay);
    btnNight?.addEventListener('click', switchToNight);

    // Auto toggle every 6 seconds or sync with orbit
    let isDay = true;
    if (heroDay && heroNight && heroSection && btnMorning && btnNight) setInterval(() => {
        isDay = !isDay;
        if (isDay) switchToDay();
        else switchToNight();
    }, 6000);

    // INTERACTIVE SOLAR SAVINGS CALCULATOR LOGIC
    const calculateBtn = document.getElementById('calculateBtn');
    const monthlyBillInput = document.getElementById('monthlyBillInput');
    const resSystemSize = document.getElementById('resSystemSize');
    const resSavings = document.getElementById('resSavings');
    const resPayback = document.getElementById('resPayback');
    const res7Year = document.getElementById('res7Year');
    const propertyTypeSelect = document.getElementById('propertyTypeSelect');
    const propertyFactors = {
        residential: { size: 1, savings: 0.85 },
        commercial: { size: 1.2, savings: 0.9 },
        agricultural: { size: 1.35, savings: 0.88 },
        institutional: { size: 1.15, savings: 0.9 }
    };

    function calculateSavings() {
        const bill = Number.parseFloat(monthlyBillInput.value);
        if (!Number.isFinite(bill) || bill < 1000) {
            monthlyBillInput.setCustomValidity('Enter a monthly bill of at least Ksh 1,000.');
            monthlyBillInput.reportValidity();
            return;
        }
        monthlyBillInput.setCustomValidity('');
        const factor = propertyFactors[propertyTypeSelect.value] || propertyFactors.residential;
        const systemSizeKw = Math.max(0.5, (bill / 3000) * factor.size).toFixed(1);
        const monthlySavingAmount = Math.round(bill * factor.savings);
        const paybackYears = Math.max(2.5, 3.5 - (Number(systemSizeKw) * 0.05));
        const sevenYearTotal = monthlySavingAmount * 12 * 7;

        resSystemSize.textContent = `${systemSizeKw} kW`;
        resSavings.textContent = `Ksh ${monthlySavingAmount.toLocaleString('en-KE')}`;
        resPayback.textContent = `${paybackYears.toFixed(1)} years`;
        res7Year.textContent = `Ksh ${sevenYearTotal.toLocaleString('en-KE')}`;
    }

    if (calculateBtn && propertyTypeSelect && monthlyBillInput) {
        calculateBtn.addEventListener('click', calculateSavings);
        propertyTypeSelect.addEventListener('change', calculateSavings);
        monthlyBillInput.addEventListener('input', () => monthlyBillInput.setCustomValidity(''));
        calculateSavings();
    }

    // Send quote requests directly to the company's WhatsApp number.
    const quoteForm = document.getElementById('quoteForm');
    const formResponseMsg = document.getElementById('formResponseMsg');

    quoteForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const details = [
            `Name: ${document.getElementById('qName').value}`,
            `Email: ${document.getElementById('qEmail').value}`,
            `Phone: ${document.getElementById('qPhone').value}`,
            `Service: ${document.getElementById('qService').value}`,
            `Property type: ${document.getElementById('propertyTypeSelect').value}`,
            `Monthly bill: Ksh ${monthlyBillInput.value}`,
            `Estimated savings: ${resSavings.textContent}`,
            `Message: ${document.getElementById('qMessage').value || 'No additional details provided.'}`
        ].join('\n');
        const whatsappUrl = `https://wa.me/254727896351?text=${encodeURIComponent(`Hello Aqua Solar Technologies, I would like to request a quote.\n\n${details}`)}`;
        window.open(whatsappUrl, '_blank', 'noopener');
        formResponseMsg.style.color = '#27ae60';
        formResponseMsg.textContent = 'Your WhatsApp message is ready. Please send it to complete your request.';
    });

    // Customer reviews are public only after an administrator approves them.
    const reviewsList = document.getElementById('reviewsList');
    const reviewForm = document.getElementById('reviewForm');
    const reviewResponse = document.getElementById('reviewResponse');
    const renderReviews = reviews => {
        if (!reviewsList) return;
        reviewsList.replaceChildren();
        if (!reviews.length) {
            const empty = document.createElement('p');
            empty.className = 'reviews-empty';
            empty.textContent = 'Be the first customer to leave a review.';
            reviewsList.append(empty);
            return;
        }
        reviews.forEach(review => {
            const article = document.createElement('article');
            article.className = 'review-card';
            const stars = document.createElement('div');
            stars.className = 'review-stars';
            stars.textContent = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;
            const quote = document.createElement('p');
            quote.textContent = review.comment;
            const author = document.createElement('strong');
            author.textContent = review.name;
            article.append(stars, quote, author);
            reviewsList.append(article);
        });
    };
    if (reviewsList) fetch('/api/reviews').then(response => response.ok ? response.json() : { reviews: [] }).then(data => renderReviews(data.reviews || [])).catch(() => renderReviews([]));
    reviewForm?.addEventListener('submit', async event => {
        event.preventDefault();
        reviewResponse.textContent = '';
        try {
            const response = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json', ...csrfHeader() }, body: JSON.stringify({ website: document.getElementById('reviewWebsite').value, name: document.getElementById('reviewName').value, rating: Number(document.getElementById('reviewRating').value), comment: document.getElementById('reviewComment').value }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Unable to submit review.');
            reviewResponse.style.color = '#27ae60';
            reviewResponse.textContent = result.message;
            reviewForm.reset();
        } catch (error) {
            reviewResponse.style.color = '#c0392b';
            reviewResponse.textContent = error.message;
        }
    });

    // Keep the long project list usable without scrolling through every row.
    const projectSearch = document.getElementById('projectSearch');
    const projectCount = document.getElementById('projectCount');
    const projectRows = [...document.querySelectorAll('.projects-table tbody tr')];
    function filterProjects() {
        const query = projectSearch.value.trim().toLowerCase();
        const visibleRows = projectRows.filter(row => {
            const matches = row.textContent.toLowerCase().includes(query);
            row.hidden = !matches;
            return matches;
        });
        projectCount.textContent = `${visibleRows.length} of ${projectRows.length} projects`;
    }
    if (projectSearch && projectCount) {
        projectSearch.addEventListener('input', filterProjects);
        filterProjects();
    }
});
