// PWA Install Handler
// Must be loaded as regular script (not module) to catch beforeinstallprompt early

let deferredPrompt = null;

function initPasteLink() {
    const btn = document.getElementById('paste-link-btn');
    const modal = document.getElementById('paste-link-modal');
    if (!btn || !modal) return;

    function showPasteLink() {
        btn.classList.remove('hidden');
        btn.classList.add('flex');
    }

    // Show immediately if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
        showPasteLink();
    }

    // Also show when installed during this session (no refresh needed)
    window.addEventListener('appinstalled', showPasteLink);

    const input = document.getElementById('paste-link-input');
    const goBtn = document.getElementById('paste-link-go');
    const cancelBtn = document.getElementById('paste-link-cancel');

    function openModal() {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        input.value = '';
        goBtn.disabled = true;
        input.focus();
    }

    function closeModal() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    function navigate() {
        const raw = input.value.trim();
        if (!raw) return;
        try {
            const url = new URL(raw);
            window.location.href = url.pathname + url.search + url.hash;
        } catch {
            window.location.href = raw;
        }
    }

    btn.addEventListener('click', openModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    input.addEventListener('input', () => { goBtn.disabled = !input.value.trim(); });
    goBtn.addEventListener('click', navigate);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) navigate(); });
}

function initInstallButton() {
    const installBtn = document.getElementById('install-btn');
    if (!installBtn) return;

    // Don't show if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.classList.remove('hidden');
        installBtn.classList.add('flex');
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] Install outcome:', outcome);
        deferredPrompt = null;
        installBtn.classList.add('hidden');
        installBtn.classList.remove('flex');
    });

    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed');
        deferredPrompt = null;
        installBtn.classList.add('hidden');
        installBtn.classList.remove('flex');
    });
}

// Run when DOM is ready
function initPWA() {
    initInstallButton();
    initPasteLink();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWA);
} else {
    initPWA();
}
