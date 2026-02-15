// Fade in elements with .page-fade class after a short delay.
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.querySelectorAll('.page-fade').forEach(el => el.classList.add('visible'));
    }, 100);
});
