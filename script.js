const getCart = () => JSON.parse(localStorage.getItem('northstarCart') || '[]');
const saveCart = cart => {
    localStorage.setItem('northstarCart', JSON.stringify(cart));
    updateCartCount();
};
const updateCartCount = () => {
    const count = getCart().reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll('[data-cart-count]').forEach(element => { element.textContent = count; });
};

const cartDrawer = document.getElementById('cartDrawer');
const renderCart = () => {
    const items = getCart();
    const cartItems = document.getElementById('cartItems');
    if (!cartItems) return;
    cartItems.innerHTML = items.length ? items.map(item => `
        <div class="cart-item"><div><strong>${item.name}</strong><span>$${Number(item.price).toLocaleString()} each</span></div>
        <div class="cart-quantity"><button type="button" data-cart-action="decrease" data-cart-id="${item.id}">-</button><span>${item.quantity}</span><button type="button" data-cart-action="increase" data-cart-id="${item.id}">+</button></div></div>`).join('') : '<p class="empty-cart">Your cart is empty.</p>';
    document.getElementById('cartTotal').textContent = `$${items.reduce((total, item) => total + item.price * item.quantity, 0).toLocaleString()}`;
    updateCartCount();
};

document.querySelectorAll('.cart-open').forEach(button => button.addEventListener('click', () => {
    renderCart();
    cartDrawer.hidden = false;
    cartDrawer.setAttribute('aria-hidden', 'false');
    document.getElementById('cartOverlay').hidden = false;
}));
document.querySelectorAll('.cart-close, #cartOverlay').forEach(element => element.addEventListener('click', () => {
    cartDrawer.hidden = true;
    cartDrawer.setAttribute('aria-hidden', 'true');
    document.getElementById('cartOverlay').hidden = true;
}));
document.getElementById('cartItems')?.addEventListener('click', event => {
    const button = event.target.closest('[data-cart-action]');
    if (!button) return;
    const cart = getCart();
    const item = cart.find(value => value.id === button.dataset.cartId);
    if (item) button.dataset.cartAction === 'increase' ? item.quantity++ : item.quantity--;
    saveCart(cart.filter(value => value.quantity > 0));
    renderCart();
});

const checkoutForm = document.getElementById('checkoutForm');
if (checkoutForm) checkoutForm.addEventListener('submit', async event => {
    event.preventDefault();
    const items = getCart();
    const message = document.getElementById('checkoutMessage');
    if (!items.length) { message.textContent = 'Add a product before checking out.'; return; }
    message.textContent = 'Placing your order...';
    try {
        const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(new FormData(checkoutForm)), items: items.map(item => ({ productId: item.id, quantity: item.quantity })) }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not place your order.');
        localStorage.removeItem('northstarCart');
        renderCart();
        checkoutForm.reset();
        message.textContent = 'Order received. We will contact you soon.';
    } catch (error) { message.textContent = error.message; }
});

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
            const endpoint = mode === 'register' ? '/api/register' : '/api/login';
            const response = await fetch(endpoint, {
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

const ordersTable = document.getElementById('ordersTable');
if (ordersTable) {
    fetch('/api/orders').then(response => response.json()).then(orders => {
        ordersTable.innerHTML = orders.length ? orders.map(order => `<tr><td>${new Date(order.createdAt).toLocaleString()}</td><td>${order.customerEmail}</td><td>${order.phone}</td><td>${order.governorate}, ${order.city}<br>${order.address}</td><td>${order.items.map(item => `${item.title} x${item.quantity}`).join('<br>')}</td><td>$${Number(order.totalPrice).toLocaleString()}<br><span class="order-status">${order.status}</span></td></tr>`).join('') : '<tr><td colspan="6">No orders yet.</td></tr>';
    }).catch(error => { ordersTable.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`; });
}

const usersTable = document.getElementById('usersTable');
if (usersTable) {
    fetch('/api/users')
        .then(async response => {
            const users = await response.json();
            if (!response.ok) throw new Error(users.error || 'Could not load users.');
            usersTable.innerHTML = users.length
                ? users.map(user => `<tr><td>${user.email}</td><td>${user._id}</td></tr>`).join('')
                : '<tr><td colspan="2">No registered users yet.</td></tr>';
        })
        .catch(error => { usersTable.innerHTML = `<tr><td colspan="2">${error.message}</td></tr>`; });
}
