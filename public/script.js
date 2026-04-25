const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('userEmail').value;
        const message = document.getElementById('userMessage').value;

        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, message })
            });

            if (!response.ok) {
                throw new Error('Server error');
            }

            const result = await response.json();
            alert('تم إرسال الرسالة بنجاح');
            contactForm.reset();
        } catch (err) {
            alert('فشل الاتصال بالخادم. يرجى المحاولة لاحقاً.');
            console.error(err);
        }
    });
}
