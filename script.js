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
    const loadProducts = async () => {
        try {
            const response = await fetch('/api/products');
            if (!response.ok) throw new Error('Could not load products.');
            const products = await response.json();
            document.querySelector('.catalog-tools span').textContent = `${products.length.toString().padStart(2, '0')} pieces`;
            productGrid.innerHTML = products.length ? products.map(product => `
                <article class="product-card">
                    <div class="product-image">${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.title}" loading="lazy">` : '<div class="image-placeholder">NS</div>'}</div>
                    <div class="product-info"><h3>${product.title}</h3><p>${product.description || ''}</p><div class="product-buy"><strong>$${Number(product.price).toLocaleString()}</strong><button class="add-button" data-product-id="${product._id}" type="button">Add to cart <span>+</span></button></div></div>
                </article>`).join('') : '<p class="empty-store">No products available right now.</p>';
            productGrid.querySelectorAll('[data-product-id]').forEach(button => button.addEventListener('click', () => {
                const product = products.find(item => item._id === button.dataset.productId);
                const cart = getCart();
                const existing = cart.find(item => item.id === product._id);
                existing ? existing.quantity++ : cart.push({ id: product._id, name: product.title, price: product.price, quantity: 1 });
                saveCart(cart);
                button.innerHTML = 'Added <span>✓</span>';
                setTimeout(() => { button.innerHTML = 'Add to cart <span>+</span>'; }, 1200);
            }));
        } catch (error) {
            productGrid.innerHTML = '<p class="empty-store">No products available right now.</p>';
            console.error(error);
        }
    };
    loadProducts();
    setInterval(loadProducts, 10000);
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

const productForm = document.getElementById('productForm');
if (productForm) {
    const adminProducts = document.getElementById('adminProducts');
    const formMessage = document.getElementById('productFormMessage');
    const loadAdminProducts = async () => {
        const response = await fetch('/api/products');
        const products = await response.json();
        adminProducts.innerHTML = products.length ? products.map(product => `
            <article class="admin-product-row">
                <div><strong>${product.title}</strong><span>$${Number(product.price).toLocaleString()}</span></div>
                <button class="delete-product" data-product-id="${product._id}" type="button">Delete</button>
            </article>`).join('') : '<p>No products available right now.</p>';
        adminProducts.querySelectorAll('.delete-product').forEach(button => button.addEventListener('click', async () => {
            button.disabled = true;
            const response = await fetch(`/api/products/${button.dataset.productId}`, { method: 'DELETE' });
            if (!response.ok) {
                formMessage.textContent = (await response.json()).error || 'Could not delete product.';
                button.disabled = false;
                return;
            }
            await loadAdminProducts();
        }));
    };
    productForm.addEventListener('submit', async event => {
        event.preventDefault();
        formMessage.textContent = 'Saving product...';
        const formData = new FormData(productForm);
        try {
            const response = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(formData))
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not save product.');
            productForm.reset();
            formMessage.textContent = 'Product added.';
            await loadAdminProducts();
        } catch (error) {
            formMessage.textContent = error.message;
        }
    });
    loadAdminProducts().catch(error => { formMessage.textContent = error.message; });
}
