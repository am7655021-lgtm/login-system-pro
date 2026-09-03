const products = [
    { id: 1, name: 'Field Laptop 14', category: 'Computers', price: 1299, description: 'A quiet, capable daily machine with all-day battery.', image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85' },
    { id: 2, name: 'Studio Headphones', category: 'Audio', price: 189, description: 'Balanced wireless sound for focused work and travel.', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85' },
    { id: 3, name: 'Desk Light Mini', category: 'Workspace', price: 74, description: 'Warm, adjustable light for late ideas and early starts.', image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85' },
    { id: 4, name: 'Mechanical Keys', category: 'Accessories', price: 129, description: 'Tactile low-profile keys in a compact aluminum frame.', image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=85' },
    { id: 5, name: 'Everyday Carry Pack', category: 'Workspace', price: 98, description: 'A structured recycled canvas pack for your whole setup.', image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85' },
    { id: 6, name: 'USB-C Power Hub', category: 'Accessories', price: 59, description: 'One clean connection for your desk, wherever it travels.', image: 'https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=900&q=85' }
];

const getCart = () => JSON.parse(localStorage.getItem('northstarCart') || '[]');
const saveCart = cart => {
    localStorage.setItem('northstarCart', JSON.stringify(cart));
    updateCartCount();
};
const updateCartCount = () => {
    const count = getCart().reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll('[data-cart-count]').forEach(element => { element.textContent = count; });
};

const authForm = document.getElementById('authForm');
if (authForm) {
    if (localStorage.getItem('storeLoggedIn') === 'true') window.location.replace('/shop.html');
    let mode = 'login';
    document.querySelectorAll('[data-auth-mode]').forEach(tab => tab.addEventListener('click', () => {
        mode = tab.dataset.authMode;
        document.querySelectorAll('[data-auth-mode]').forEach(item => item.classList.toggle('active', item === tab));
        document.getElementById('authSubmitText').textContent = mode === 'login' ? 'Enter the store' : 'Create my account';
        document.getElementById('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
        document.getElementById('authMessage').textContent = '';
    }));

    authForm.addEventListener('submit', async event => {
        event.preventDefault();
        const message = document.getElementById('authMessage');
        message.textContent = 'Checking your details...';
        try {
            const response = await fetch(`/api/${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: document.getElementById('authEmail').value, password: document.getElementById('authPassword').value })
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Unable to continue.');
            localStorage.setItem('storeLoggedIn', 'true');
            localStorage.setItem('storeUserEmail', document.getElementById('authEmail').value.trim());
            window.location.href = '/shop.html';
        } catch (error) {
            message.textContent = error.message;
        }
    });
}

const productGrid = document.getElementById('productGrid');
if (productGrid) {
    if (localStorage.getItem('storeLoggedIn') !== 'true') window.location.replace('/');
    const welcomeTitle = document.getElementById('welcomeTitle');
    const email = localStorage.getItem('storeUserEmail');
    const userName = email ? email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '';
    if (welcomeTitle && userName) welcomeTitle.textContent = `Welcome to Disha's store, ${userName}!`;
    productGrid.innerHTML = products.map(product => `
        <article class="product-card">
            <div class="product-image"><img src="${product.image}" alt="${product.name}" loading="lazy"><span>${product.category}</span></div>
            <div class="product-info"><h3>${product.name}</h3><p>${product.description}</p><div class="product-buy"><strong>$${product.price.toLocaleString()}</strong><button class="add-button" data-product-id="${product.id}" type="button">Add to cart <span>+</span></button></div></div>
        </article>`).join('');
    productGrid.addEventListener('click', event => {
        const button = event.target.closest('[data-product-id]');
        if (!button) return;
        const product = products.find(item => item.id === Number(button.dataset.productId));
        const cart = getCart();
        const existing = cart.find(item => item.id === product.id);
        existing ? existing.quantity++ : cart.push({ ...product, quantity: 1 });
        saveCart(cart);
        button.innerHTML = 'Added <span>✓</span>';
        setTimeout(() => { button.innerHTML = 'Add to cart <span>+</span>'; }, 1200);
    });
    updateCartCount();
}

const logoutButton = document.getElementById('logoutButton');
if (logoutButton) logoutButton.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    localStorage.removeItem('storeLoggedIn');
    localStorage.removeItem('storeUserEmail');
    localStorage.removeItem('northstarCart');
    window.location.href = '/';
});
