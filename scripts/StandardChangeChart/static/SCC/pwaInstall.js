// PWA Install Handler
// Must be loaded as regular script (not module) to catch beforeinstallprompt early

let deferredPrompt = null;

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
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInstallButton);
} else {
    initInstallButton();
}
