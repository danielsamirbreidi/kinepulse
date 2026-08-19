/* ==========================================
KINÉPULSE — Bandeau de consentement cookies
Conforme Loi 25 (Québec) + Google Consent Mode v2
========================================== */

(function () {
    var STORAGE_KEY = 'kinepulse_cookie_consent';

    function getStoredConsent() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    function setStoredConsent(value) {
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (e) {}
    }

    function updateGtagConsent(granted) {
        if (typeof gtag !== 'function') return;
        gtag('consent', 'update', {
            'analytics_storage': granted ? 'granted' : 'denied'
        });
    }

    function injectStyles() {
        var style = document.createElement('style');
        style.textContent = [
            '#cookie-consent-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;',
            'background:var(--secondary,#16212B);color:#fff;padding:20px 24px;',
            'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px;',
            'font-family:Inter,sans-serif;box-shadow:0 -4px 20px rgba(0,0,0,.15);}',
            '#cookie-consent-banner p{margin:0;font-size:.92rem;line-height:1.5;max-width:640px;color:#fff;}',
            '#cookie-consent-banner a{color:var(--primary-light,#9AD7D3);text-decoration:underline;}',
            '#cookie-consent-banner .cc-actions{display:flex;gap:10px;flex-wrap:wrap;}',
            '#cookie-consent-banner button{cursor:pointer;border:none;border-radius:8px;padding:10px 20px;',
            'font-family:Inter,sans-serif;font-size:.9rem;font-weight:600;white-space:nowrap;}',
            '#cc-accept{background:var(--primary,#4F9D93);color:#fff;}',
            '#cc-accept:hover{background:var(--primary-dark,#356E67);}',
            '#cc-decline{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4)!important;}',
            '#cc-decline:hover{background:rgba(255,255,255,.1);}',
            '@media (max-width:640px){#cookie-consent-banner{flex-direction:column;text-align:center;padding:18px;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function showBanner() {
        injectStyles();
        var banner = document.createElement('div');
        banner.id = 'cookie-consent-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Consentement aux cookies');
        banner.innerHTML =
            '<p>Nous utilisons des cookies analytiques (Google Analytics) pour comprendre comment vous utilisez notre site. ' +
            'Vous pouvez accepter ou refuser. Voir notre <a href="' +
            (location.pathname.indexOf('/pages/') !== -1 ? '' : 'pages/') +
            'politique-de-confidentialite.html">politique de confidentialité</a>.</p>' +
            '<div class="cc-actions">' +
            '<button id="cc-decline" type="button">Refuser</button>' +
            '<button id="cc-accept" type="button">Accepter</button>' +
            '</div>';
        document.body.appendChild(banner);

        document.getElementById('cc-accept').addEventListener('click', function () {
            setStoredConsent('granted');
            updateGtagConsent(true);
            banner.remove();
        });
        document.getElementById('cc-decline').addEventListener('click', function () {
            setStoredConsent('denied');
            updateGtagConsent(false);
            banner.remove();
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var stored = getStoredConsent();
        if (stored === 'granted') {
            updateGtagConsent(true);
        } else if (stored === 'denied') {
            updateGtagConsent(false);
        } else {
            showBanner();
        }
    });
})();
