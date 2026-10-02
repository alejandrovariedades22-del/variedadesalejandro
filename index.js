(() => {
    'use strict';

    const CART_STORAGE_KEY = 'alejandro_cart';
    const WHATSAPP_LINK_ID = 'whatsappContactLink';
    const DEFAULT_VARIANT = 'Estándar';
    const categoryLabels = {
        'mujer-ropa': 'Ropa Mujer',
        'hombre-ropa': 'Ropa Hombre',
        'mujer-calzado': 'Calzado',
        'ninos-ropa': 'Niños',
        juguetes: 'Juguetes',
        hogar: 'Hogar y comodidades',
        corporal: 'Productos de belleza',
        belleza: 'Salón',
        electro: 'Electrodomésticos'
    };
    const categoryIds = [
        'mujer-ropa',
        'hombre-ropa',
        'mujer-calzado',
        'ninos-ropa',
        'juguetes',
        'hogar',
        'corporal',
        'belleza',
        'electro'
    ];
    const state = {
        products: [],
        cart: [],
        category: 'all',
        activeProduct: null,
        selectedVariant: '',
        quantity: 1,
        productTrigger: null,
        locationTrigger: null,
        cartTrigger: null,
        catalogFresh: false,
        loadSequence: 0,
        checkoutInProgress: false,
        restoreNotice: ''
    };

    const dom = {};

    function cacheDom() {
        [
            'searchBar',
            'categorias',
            'resultsSummary',
            'catalogNotice',
            'storeGrid',
            'menu-toggle',
            'productModal',
            'modalImg',
            'modalImagePlaceholder',
            'modalTitle',
            'modalPrice',
            'modalStock',
            'modalProductDescription',
            'variantLabel',
            'sizeOptionsBox',
            'qtyVal',
            'decreaseQty',
            'increaseQty',
            'qtyArea',
            'addToCartBtn',
            'locationModal',
            'cartSidebar',
            'cartOverlay',
            'cartBadge',
            'cartItemsList',
            'cartNotice',
            'cartTotalVal',
            'checkoutButton',
            WHATSAPP_LINK_ID
        ].forEach((id) => {
            dom[id] = document.getElementById(id);
        });
        dom.menuToggle = dom['menu-toggle'];
    }

    function formatPrice(value) {
        return `$${Number(value).toFixed(2)}`;
    }

    function getProductStock(product) {
        const stock = Number(product.stock);
        return Number.isFinite(stock) ? Math.max(0, stock) : 0;
    }

    function getProductVariants(product) {
        if (typeof product.variante !== 'string') return [DEFAULT_VARIANT];
        const variants = product.variante.split(',').map((variant) => variant.trim()).filter(Boolean);
        return variants.length ? [...new Set(variants)] : [DEFAULT_VARIANT];
    }

    function isValidProduct(product) {
        const hasValidId = product
            && (typeof product.id === 'string' || (typeof product.id === 'number' && Number.isFinite(product.id)))
            && String(product.id).trim() !== '';
        const hasPrice = product
            && (typeof product.precio === 'number'
                || (typeof product.precio === 'string' && product.precio.trim() !== ''));
        const price = hasPrice ? Number(product.precio) : Number.NaN;

        return product
            && hasValidId
            && typeof product.nombre === 'string'
            && product.nombre.trim() !== ''
            && typeof product.categoria === 'string'
            && Number.isFinite(price)
            && price >= 0;
    }

    function setCatalogNotice(message, type = 'status', showRetry = false) {
        if (!dom.catalogNotice) return;
        dom.catalogNotice.replaceChildren();
        dom.catalogNotice.hidden = !message;
        dom.catalogNotice.dataset.type = type;

        if (!message) return;
        const text = document.createElement('span');
        text.textContent = message;
        dom.catalogNotice.appendChild(text);

        if (showRetry) {
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'catalog-retry';
            retry.dataset.action = 'retry-catalog';
            retry.textContent = 'Reintentar';
            dom.catalogNotice.appendChild(retry);
        }
    }

    function setCartNotice(message, type = 'status') {
        if (!dom.cartNotice) return;
        dom.cartNotice.textContent = message;
        dom.cartNotice.dataset.type = type;
    }

    function renderLoadingState() {
        if (dom.resultsSummary) dom.resultsSummary.textContent = 'Cargando productos...';
        if (dom.storeGrid) {
            dom.storeGrid.setAttribute('aria-busy', 'true');
            dom.storeGrid.replaceChildren();
        }
    }

    async function loadProducts() {
        const requestId = ++state.loadSequence;
        state.catalogFresh = false;
        updateCartUI();

        if (!state.products.length) renderLoadingState();
        setCatalogNotice('');

        try {
            if (typeof supabaseClient === 'undefined') {
                throw new Error('No está disponible la conexión configurada a Supabase.');
            }

            const { data, error } = await supabaseClient
                .from('productos')
                .select('*')
                .eq('activo', true);

            if (error) throw error;
            if (!Array.isArray(data)) throw new Error('Supabase devolvió un catálogo con formato inesperado.');
            if (requestId !== state.loadSequence) return false;

            const invalidCount = data.filter((product) => !isValidProduct(product)).length;
            if (invalidCount) {
                console.warn(`Se omitieron ${invalidCount} registros de productos con datos incompletos.`);
            }

            state.products = data.filter(isValidProduct);
            state.catalogFresh = true;
            reconcileCart();

            if (state.activeProduct) {
                const refreshedProduct = state.products.find(
                    (product) => String(product.id) === String(state.activeProduct.id)
                );
                if (refreshedProduct) {
                    state.activeProduct = refreshedProduct;
                } else {
                    closeProductModal();
                    setCartNotice('El producto abierto ya no está publicado y se cerró su detalle.', 'status');
                }
            }

            if (invalidCount) {
                setCatalogNotice(
                    'Algunos registros del catálogo no tienen los datos necesarios y no se muestran.',
                    'warning'
                );
            }
            renderStore();
            updateCartUI();
            return true;
        } catch (error) {
            if (requestId !== state.loadSequence) return false;
            console.error('Error cargando productos:', error);
            state.catalogFresh = false;
            if (!state.products.length) {
                if (dom.resultsSummary) dom.resultsSummary.textContent = 'No se pudo cargar el catálogo.';
                if (dom.storeGrid) {
                    dom.storeGrid.replaceChildren();
                    dom.storeGrid.setAttribute('aria-busy', 'false');
                }
            } else {
                renderStore();
            }
            setCatalogNotice(
                'No pudimos verificar el catálogo. Revisa tu conexión e inténtalo de nuevo.',
                'error',
                true
            );
            setCartNotice(
                state.restoreNotice
                    ? `${state.restoreNotice} No se pudo verificar la disponibilidad actual.`
                    : 'No se pudo verificar la disponibilidad actual. La consulta por WhatsApp está deshabilitada.',
                'error'
            );
            updateCartUI();
            return false;
        }
    }

    function subscribeToProductChanges() {
        if (typeof supabaseClient === 'undefined') return;

        supabaseClient
            .channel('custom-all-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => {
                void loadProducts();
            })
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.error(`No se pudo establecer la sincronización del catálogo: ${status}`);
                    setCatalogNotice(
                        'La actualización automática no está disponible. Puedes volver a cargar el catálogo.',
                        'warning',
                        true
                    );
                }
            });
    }

    function restoreCart() {
        let savedCart;
        try {
            savedCart = localStorage.getItem(CART_STORAGE_KEY);
        } catch (error) {
            console.error('No se pudo leer el carrito guardado:', error);
            setCartNotice('No se pudo acceder al almacenamiento local de este navegador.', 'error');
            return;
        }

        if (!savedCart) return;
        try {
            const parsedCart = JSON.parse(savedCart);
            if (!Array.isArray(parsedCart)) throw new Error('El carrito guardado no es una lista.');
            state.cart = parsedCart;
        } catch (error) {
            console.error('El carrito guardado no tiene un formato válido:', error);
            state.cart = [];
            try {
                localStorage.removeItem(CART_STORAGE_KEY);
            } catch (storageError) {
                console.error('No se pudo limpiar el carrito local inválido:', storageError);
            }
            state.restoreNotice = 'Se descartaron datos locales dañados. El carrito se inició vacío.';
            setCartNotice(state.restoreNotice, 'warning');
        }
    }

    function persistCart() {
        try {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
            return true;
        } catch (error) {
            console.error('No se pudo guardar el carrito local:', error);
            setCartNotice('El navegador no permitió guardar el carrito. Podrías perderlo al salir.', 'error');
            return false;
        }
    }

    function createCartItemId(productId, variant) {
        return JSON.stringify([String(productId), variant]);
    }

    function reconcileCart() {
        const reconciled = [];
        const quantitiesByProduct = new Map();
        let removed = 0;
        let adjusted = 0;

        state.cart.forEach((item) => {
            const productId = item && (typeof item.id === 'string' || typeof item.id === 'number')
                ? String(item.id)
                : '';
            const product = state.products.find((candidate) => String(candidate.id) === productId);
            const requestedQuantity = Number(item?.qty);
            const variant = typeof item?.talla === 'string' ? item.talla : '';

            if (!product || product.categoria === 'belleza'
                || !Number.isInteger(requestedQuantity) || requestedQuantity < 1
                || !getProductVariants(product).includes(variant)) {
                removed += 1;
                return;
            }

            const stock = Math.floor(getProductStock(product));
            const usedStock = quantitiesByProduct.get(productId) || 0;
            const available = Math.max(0, stock - usedStock);
            const quantity = Math.min(requestedQuantity, available);
            if (!quantity) {
                removed += 1;
                return;
            }
            if (quantity !== requestedQuantity
                || item.nombre !== product.nombre
                || Number(item.precio) !== Number(product.precio)
                || item.categoria !== product.categoria
                || item.imagen !== (typeof product.imagen === 'string' ? product.imagen : '')) {
                adjusted += 1;
            }

            quantitiesByProduct.set(productId, usedStock + quantity);
            reconciled.push({
                cartItemId: createCartItemId(product.id, variant),
                id: product.id,
                nombre: product.nombre,
                precio: Number(product.precio),
                imagen: typeof product.imagen === 'string' ? product.imagen : '',
                talla: variant,
                categoria: product.categoria,
                qty: quantity
            });
        });

        state.cart = reconciled;
        const persisted = persistCart();

        if (state.restoreNotice) {
            setCartNotice(state.restoreNotice, 'warning');
            state.restoreNotice = '';
        } else if (removed || adjusted) {
            const changes = [];
            if (removed) changes.push(`${removed} artículo(s) retirado(s) por falta de publicación, variante o existencias`);
            if (adjusted) changes.push(`${adjusted} artículo(s) actualizado(s) con los datos actuales`);
            if (!persisted) changes.push('no se pudieron guardar los cambios en este navegador');
            setCartNotice(`${changes.join('; ')}. Revisa el carrito; sigue siendo una consulta estimada.`, 'warning');
        } else if (state.catalogFresh && persisted) {
            setCartNotice('Disponibilidad verificada ahora. El total es estimado; enviar una consulta no confirma una compra ni reserva.', 'status');
        }
    }

    function renderStore() {
        if (!dom.storeGrid) return;
        dom.storeGrid.replaceChildren();
        dom.storeGrid.setAttribute('aria-busy', 'false');

        const query = dom.searchBar?.value.trim().toLocaleLowerCase() || '';
        const filtered = state.products.filter((product) => {
            const matchesCategory = state.category === 'all' || product.categoria === state.category;
            const matchesName = String(product.nombre).toLocaleLowerCase().includes(query);
            return matchesCategory && matchesName;
        });

        if (dom.resultsSummary) {
            const count = filtered.length;
            dom.resultsSummary.textContent = `${count} ${count === 1 ? 'resultado' : 'resultados'}`;
        }
        if (!filtered.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'store-empty-msg';
            emptyMessage.textContent = state.products.length
                ? 'No se encontraron artículos con esta búsqueda o categoría.'
                : 'Todavía no hay productos publicados en el catálogo.';
            dom.storeGrid.appendChild(emptyMessage);
            return;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach((product) => fragment.appendChild(createProductCard(product)));
        dom.storeGrid.appendChild(fragment);
    }

    function createImagePlaceholder(className = 'product-image-placeholder') {
        const placeholder = document.createElement('span');
        placeholder.className = className;
        placeholder.textContent = 'Imagen no disponible';
        return placeholder;
    }

    function createProductCard(product) {
        const card = document.createElement('article');
        card.className = 'product-card';
        const imageBox = document.createElement('div');
        imageBox.className = 'prod-img-box';

        if (typeof product.imagen === 'string' && product.imagen.trim()) {
            const image = document.createElement('img');
            image.src = product.imagen;
            image.alt = String(product.nombre);
            image.loading = 'lazy';
            image.addEventListener('error', () => {
                image.replaceWith(createImagePlaceholder());
            }, { once: true });
            imageBox.appendChild(image);
        } else {
            imageBox.appendChild(createImagePlaceholder());
        }

        const isService = product.categoria === 'belleza';
        const available = isService || getProductStock(product) > 0;
        const availability = document.createElement('span');
        availability.className = `product-availability${available ? '' : ' unavailable'}`;
        availability.textContent = isService ? 'Servicio' : available ? 'Disponible' : 'Agotado';
        imageBox.appendChild(availability);

        const info = document.createElement('div');
        info.className = 'prod-info';
        const category = document.createElement('p');
        category.className = 'product-category';
        category.textContent = categoryLabels[product.categoria] || product.categoria;

        const title = document.createElement('h3');
        title.className = 'prod-title';
        title.textContent = product.nombre;

        const meta = document.createElement('div');
        meta.className = 'prod-meta';
        const price = document.createElement('span');
        price.className = 'prod-price';
        price.textContent = formatPrice(product.precio);
        meta.appendChild(price);

        const action = document.createElement('button');
        action.className = 'order-btn';
        action.type = 'button';
        action.dataset.action = 'open-product';
        action.dataset.productId = String(product.id);
        action.textContent = isService ? 'Ver servicio' : 'Ver detalles';
        action.setAttribute('aria-label', `${action.textContent}: ${product.nombre}`);

        info.append(category, title, meta, action);
        card.append(imageBox, info);
        return card;
    }

    function filterCategory(category) {
        if (category !== 'all' && !categoryIds.includes(category)) return;
        state.category = category;
        dom.categorias?.querySelectorAll('.cat-card[data-cat]').forEach((button) => {
            const isActive = button.dataset.cat === category;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
        renderStore();
    }

    function getVariantLabel(category) {
        if (category === 'belleza') return 'SERVICIOS';
        if (category === 'juguetes') return 'ESTILOS DISPONIBLES';
        if (category === 'hogar' || category === 'electro') return 'DISEÑOS DISPONIBLES';
        if (category === 'corporal') return 'DISPONIBLES';
        return 'TALLAS DISPONIBLES';
    }

    function getProductDescription(category) {
        if (category === 'belleza') return 'Servicio disponible en Variedades Alejandro. Consulta por WhatsApp; el envío del mensaje no reserva una cita.';
        if (category === 'juguetes') return 'Juguete disponible en Variedades Alejandro. Consulta modelos y existencias por WhatsApp.';
        if (category === 'hogar' || category === 'electro') return 'Artículo disponible en Variedades Alejandro. Consulta modelos y existencias por WhatsApp.';
        return 'Artículo disponible en Variedades Alejandro. Consulta por WhatsApp.';
    }

    function showProductImage(product) {
        dom.modalImg.hidden = true;
        dom.modalImagePlaceholder.hidden = false;
        dom.modalImagePlaceholder.textContent = 'Imagen no disponible';
        dom.modalImg.removeAttribute('src');
        dom.modalImg.alt = `Imagen de ${product.nombre}`;

        if (typeof product.imagen !== 'string' || !product.imagen.trim()) return;
        dom.modalImg.onerror = () => {
            dom.modalImg.hidden = true;
            dom.modalImagePlaceholder.hidden = false;
        };
        dom.modalImg.onload = () => {
            dom.modalImg.hidden = false;
            dom.modalImagePlaceholder.hidden = true;
        };
        dom.modalImg.src = product.imagen;
    }

    function openProductModal(productId, trigger) {
        const product = state.products.find((item) => String(item.id) === String(productId));
        if (!product) return;
        state.activeProduct = product;
        state.productTrigger = trigger || document.activeElement;
        state.quantity = 1;
        state.selectedVariant = '';

        dom.modalTitle.textContent = product.nombre;
        dom.modalPrice.textContent = formatPrice(product.precio);
        dom.modalProductDescription.textContent = getProductDescription(product.categoria);
        dom.variantLabel.textContent = getVariantLabel(product.categoria);
        dom.qtyVal.textContent = '1';
        showProductImage(product);

        const isService = product.categoria === 'belleza';
        const stock = Math.floor(getProductStock(product));
        dom.modalStock.hidden = isService;
        dom.modalStock.textContent = stock > 0 ? `Disponibles: ${stock}` : 'Agotado';
        dom.modalStock.classList.toggle('stock-out', !isService && stock <= 0);
        dom.qtyArea.hidden = isService || stock <= 0;
        dom.decreaseQty.disabled = true;
        dom.increaseQty.disabled = stock <= 1;
        dom.addToCartBtn.disabled = !isService && stock <= 0;
        dom.addToCartBtn.dataset.action = isService ? 'service-whatsapp' : 'add-to-cart';
        dom.addToCartBtn.classList.toggle('service-action', isService);
        dom.addToCartBtn.querySelector('span').textContent = isService
            ? 'Consultar servicio por WhatsApp'
            : stock > 0 ? 'Agregar al carrito' : 'Agotado';

        dom.sizeOptionsBox.replaceChildren();
        getProductVariants(product).forEach((variant, index) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = `size-btn${index === 0 ? ' selected' : ''}`;
            option.dataset.sizeValue = variant;
            option.setAttribute('aria-pressed', String(index === 0));
            option.textContent = variant;
            dom.sizeOptionsBox.appendChild(option);
            if (index === 0) state.selectedVariant = variant;
        });

        dom.productModal.classList.add('active');
        dom.productModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('product-modal-open');
        dom.productModal.querySelector('.close-modal')?.focus();
    }

    function closeProductModal() {
        if (!dom.productModal?.classList.contains('active')) return;
        dom.productModal.classList.remove('active');
        dom.productModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('product-modal-open');
        state.activeProduct = null;
        state.productTrigger?.focus();
    }

    function updateQuantity(change) {
        const product = state.activeProduct;
        if (!product || !Number.isInteger(change)) return;
        const maximum = Math.floor(getProductStock(product));
        const nextQuantity = state.quantity + change;
        if (nextQuantity < 1 || nextQuantity > maximum) return;
        state.quantity = nextQuantity;
        dom.qtyVal.textContent = String(nextQuantity);
        dom.decreaseQty.disabled = nextQuantity <= 1;
        dom.increaseQty.disabled = nextQuantity >= maximum;
    }

    function openCart(trigger) {
        if (!dom.cartSidebar.classList.contains('active')) {
            state.cartTrigger = trigger || document.activeElement;
        }
        dom.cartSidebar.classList.add('active');
        dom.cartOverlay.classList.add('active');
        dom.cartSidebar.setAttribute('aria-hidden', 'false');
        dom.cartOverlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('cart-open');
        dom.cartSidebar.querySelector('.close-cart-btn')?.focus();
    }

    function closeCart() {
        if (!dom.cartSidebar.classList.contains('active')) return;
        dom.cartSidebar.classList.remove('active');
        dom.cartOverlay.classList.remove('active');
        dom.cartSidebar.setAttribute('aria-hidden', 'true');
        dom.cartOverlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('cart-open');
        state.cartTrigger?.focus();
    }

    function addToCartCurrent() {
        let product = state.activeProduct;
        if (!product || !state.catalogFresh) {
            setCartNotice('Espera a que se verifique el catálogo antes de agregar artículos.', 'warning');
            return;
        }

        product = state.products.find((item) => String(item.id) === String(product.id));
        if (!product || product.categoria === 'belleza') {
            closeProductModal();
            setCartNotice('Este artículo ya no está disponible para agregarse al carrito.', 'warning');
            return;
        }

        const stock = Math.floor(getProductStock(product));
        const usedStock = state.cart
            .filter((item) => String(item.id) === String(product.id))
            .reduce((total, item) => total + item.qty, 0);
        const itemId = createCartItemId(product.id, state.selectedVariant);
        const existing = state.cart.find((item) => item.cartItemId === itemId);
        const requestedTotal = usedStock + state.quantity;

        if (!state.selectedVariant || !getProductVariants(product).includes(state.selectedVariant)) {
            setCartNotice('La variante seleccionada ya no está disponible. Revisa las opciones actuales.', 'warning');
            closeProductModal();
            return;
        }
        if (requestedTotal > stock) {
            setCartNotice('Las existencias cambiaron. Revisa la cantidad disponible e inténtalo de nuevo.', 'warning');
            closeProductModal();
            void loadProducts();
            return;
        }

        if (existing) {
            existing.qty += state.quantity;
            existing.nombre = product.nombre;
            existing.precio = Number(product.precio);
            existing.imagen = typeof product.imagen === 'string' ? product.imagen : '';
            existing.categoria = product.categoria;
        } else {
            state.cart.push({
                cartItemId: itemId,
                id: product.id,
                nombre: product.nombre,
                precio: Number(product.precio),
                imagen: typeof product.imagen === 'string' ? product.imagen : '',
                talla: state.selectedVariant,
                categoria: product.categoria,
                qty: state.quantity
            });
        }

        const persisted = persistCart();
        setCartNotice(
            persisted
                ? 'Artículo agregado. El importe es estimado; la disponibilidad debe confirmarse por WhatsApp.'
                : 'Artículo agregado solo en esta sesión; el navegador no pudo guardar el carrito.',
            persisted ? 'status' : 'error'
        );
        updateCartUI();
        closeProductModal();
        openCart();
    }

    function getCartItemLabel(item) {
        if (item.categoria === 'juguetes') return 'Estilo';
        if (item.categoria === 'hogar' || item.categoria === 'electro') return 'Modelo';
        return 'Talla';
    }

    function updateCartUI() {
        if (!dom.cartItemsList) return;
        dom.cartItemsList.replaceChildren();

        if (!state.catalogFresh && state.cart.length) {
            const message = document.createElement('p');
            message.className = 'empty-cart-msg';
            message.textContent = 'El carrito guardado está pendiente de verificar con el catálogo actual.';
            dom.cartItemsList.appendChild(message);
            dom.cartBadge.textContent = '0';
            dom.cartTotalVal.textContent = '—';
            dom.checkoutButton.disabled = true;
            return;
        }

        const totalItems = state.cart.reduce((total, item) => total + item.qty, 0);
        dom.cartBadge.textContent = String(totalItems);
        dom.checkoutButton.disabled = state.cart.length === 0 || !state.catalogFresh || state.checkoutInProgress;

        if (!state.cart.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'empty-cart-msg';
            emptyMessage.textContent = 'Tu carrito está vacío.';
            dom.cartItemsList.appendChild(emptyMessage);
            dom.cartTotalVal.textContent = '$0.00';
            return;
        }

        let total = 0;
        const fragment = document.createDocumentFragment();
        state.cart.forEach((item) => {
            const subtotal = item.precio * item.qty;
            total += subtotal;

            const row = document.createElement('article');
            row.className = 'cart-item';
            if (item.imagen) {
                const image = document.createElement('img');
                image.className = 'cart-item-img';
                image.src = item.imagen;
                image.alt = `Imagen de ${item.nombre}`;
                image.addEventListener('error', () => {
                    image.replaceWith(createImagePlaceholder('cart-item-img cart-item-img-placeholder'));
                }, { once: true });
                row.appendChild(image);
            } else {
                row.appendChild(createImagePlaceholder('cart-item-img cart-item-img-placeholder'));
            }

            const details = document.createElement('div');
            details.className = 'cart-item-details';
            const name = document.createElement('span');
            name.className = 'cart-item-name';
            name.textContent = item.nombre;
            const meta = document.createElement('span');
            meta.className = 'cart-item-meta';
            meta.textContent = `${getCartItemLabel(item)}: ${item.talla} | Cantidad: ${item.qty}`;
            const price = document.createElement('span');
            price.className = 'cart-item-price';
            price.textContent = formatPrice(subtotal);
            details.append(name, meta, price);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'remove-item-btn';
            remove.dataset.action = 'remove-cart-item';
            remove.dataset.cartItemId = item.cartItemId;
            remove.setAttribute('aria-label', `Quitar ${item.nombre} del carrito`);
            remove.textContent = '✕';
            row.append(details, remove);
            fragment.appendChild(row);
        });

        dom.cartItemsList.appendChild(fragment);
        dom.cartTotalVal.textContent = formatPrice(total);
    }

    function removeFromCart(cartItemId) {
        state.cart = state.cart.filter((item) => item.cartItemId !== cartItemId);
        const persisted = persistCart();
        setCartNotice(
            persisted ? 'Artículo retirado. El total sigue siendo estimado.' : 'Artículo retirado de esta sesión, pero el navegador no pudo guardar el cambio.',
            persisted ? 'status' : 'error'
        );
        updateCartUI();
    }

    function getWhatsAppPhone() {
        const href = dom[WHATSAPP_LINK_ID]?.getAttribute('href');
        if (!href) throw new Error('No se encontró el enlace de contacto de WhatsApp configurado.');
        const url = new URL(href, window.location.href);
        const phone = url.searchParams.get('phone') || url.pathname.split('/').filter(Boolean).pop();
        if (!phone || !/^\d+$/.test(phone)) {
            throw new Error('El enlace de contacto no contiene un número de WhatsApp válido.');
        }
        return phone;
    }

    function openWhatsApp(message) {
        const phone = getWhatsAppPhone();
        const url = createWhatsAppUrl(phone, message);
        const popup = window.open(url, '_blank');
        if (!popup) {
            setCartNotice('El navegador bloqueó la ventana emergente. Permite abrir una pestaña para consultar por WhatsApp.', 'error');
            return false;
        }
        popup.opener = null;
        return true;
    }

    function createWhatsAppUrl(phone, message) {
        return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
    }

    function getCartSnapshot() {
        return JSON.stringify(state.cart.map((item) => [
            item.cartItemId,
            item.qty,
            item.precio,
            item.nombre,
            item.talla
        ]));
    }

    async function checkoutCartWhatsApp() {
        if (!state.cart.length || !state.catalogFresh || state.checkoutInProgress) return;
        const pendingWindow = window.open('about:blank', '_blank');
        if (!pendingWindow) {
            setCartNotice('El navegador bloqueó la ventana emergente. Permite abrir una pestaña para consultar por WhatsApp.', 'error');
            return;
        }
        pendingWindow.opener = null;
        state.checkoutInProgress = true;
        updateCartUI();

        const previousCart = getCartSnapshot();
        setCartNotice('Verificando de nuevo productos, variantes, precios y existencias...', 'status');
        try {
            const verified = await loadProducts();
            if (!verified) {
                pendingWindow.close();
                state.checkoutInProgress = false;
                updateCartUI();
                return;
            }
            if (!state.cart.length || getCartSnapshot() !== previousCart) {
                pendingWindow.close();
                state.checkoutInProgress = false;
                setCartNotice(
                    state.cart.length
                        ? 'Los datos del catálogo cambiaron y el carrito se ajustó. Revísalo antes de enviar otra consulta.'
                        : 'Los artículos guardados ya no están disponibles. Se retiraron y no se envió la consulta.',
                    'warning'
                );
                updateCartUI();
                return;
            }

            const lines = state.cart.map((item, index) => (
                `${index + 1}. *${item.nombre}*\n`
                + `   • ${getCartItemLabel(item)}: ${item.talla}\n`
                + `   • Cantidad: ${item.qty}\n`
                + `   • Subtotal estimado: ${formatPrice(item.precio * item.qty)}`
            ));
            const total = state.cart.reduce((sum, item) => sum + item.precio * item.qty, 0);
            const message = `¡Hola Variedades Alejandro! Quisiera consultar la disponibilidad de estos artículos:\n\n`
                + `${lines.join('\n\n')}\n\n`
                + `Total estimado: ${formatPrice(total)}\n\n`
                + 'Este mensaje es una consulta y no confirma una compra. ¿Podrían confirmarme la disponibilidad?';
            pendingWindow.location.replace(createWhatsAppUrl(getWhatsAppPhone(), message));
            state.checkoutInProgress = false;
            updateCartUI();
        } catch (error) {
            pendingWindow.close();
            state.checkoutInProgress = false;
            console.error('No se pudo preparar la consulta de WhatsApp:', error);
            setCartNotice('No se pudo abrir WhatsApp. Revisa el enlace de contacto.', 'error');
            updateCartUI();
        }
    }

    function sendSalonWhatsApp() {
        const product = state.activeProduct;
        if (!product || product.categoria !== 'belleza') return;
        if (!getProductVariants(product).includes(state.selectedVariant)) {
            setCartNotice('La opción del servicio cambió. Cierra el detalle y vuelve a abrirlo para revisar las opciones actuales.', 'warning');
            return;
        }
        const message = `¡Hola! Quisiera consultar información de un servicio del Salón de Variedades Alejandro:\n\n`
            + `*Servicio:* ${product.nombre}\n`
            + `*Opción:* ${state.selectedVariant}\n`
            + `*Precio publicado:* ${formatPrice(product.precio)}\n\n`
            + '¿Podrían brindarme más información para coordinar el día y la hora? Este mensaje no reserva una cita.';
        try {
            openWhatsApp(message);
        } catch (error) {
            console.error('No se pudo preparar la consulta del servicio:', error);
            setCartNotice('No se pudo abrir WhatsApp. Revisa el enlace de contacto.', 'error');
        }
    }

    function openLocation(trigger) {
        state.locationTrigger = trigger;
        dom.menuToggle.checked = false;
        dom.locationModal.classList.add('active');
        dom.locationModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('location-modal-open');
        dom.locationModal.querySelector('.location-close')?.focus();
    }

    function closeLocation() {
        if (!dom.locationModal.classList.contains('active')) return;
        dom.locationModal.classList.remove('active');
        dom.locationModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('location-modal-open');
        state.locationTrigger?.focus();
    }

    function getActiveDialog() {
        if (dom.productModal.classList.contains('active')) return dom.productModal.querySelector('[role="dialog"]');
        if (dom.locationModal.classList.contains('active')) return dom.locationModal.querySelector('[role="dialog"]');
        if (dom.cartSidebar.classList.contains('active')) return dom.cartSidebar;
        return null;
    }

    function trapDialogFocus(event) {
        const dialog = getActiveDialog();
        if (!dialog || event.key !== 'Tab') return;
        const focusable = [...dialog.querySelectorAll(
            'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )].filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');

        if (!focusable.length) {
            event.preventDefault();
            dialog.focus();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    }

    function registerEvents() {
        dom.searchBar?.addEventListener('input', renderStore);
        dom.categorias?.addEventListener('click', (event) => {
            const button = event.target.closest('.cat-card[data-cat]');
            if (button) filterCategory(button.dataset.cat);
        });

        document.querySelectorAll('img[data-hide-on-error]').forEach((image) => {
            image.addEventListener('error', () => {
                image.hidden = true;
            }, { once: true });
        });

        document.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;

            if (dom.menuToggle.checked && !target.closest('.header-actions')) {
                dom.menuToggle.checked = false;
            }

            const action = target.closest('[data-action]');
            if (action) {
                switch (action.dataset.action) {
                    case 'open-product':
                        openProductModal(action.dataset.productId, action);
                        break;
                    case 'open-cart':
                        openCart(action);
                        break;
                    case 'close-cart':
                        closeCart();
                        break;
                    case 'checkout':
                        void checkoutCartWhatsApp();
                        break;
                    case 'close-product':
                        closeProductModal();
                        break;
                    case 'add-to-cart':
                        addToCartCurrent();
                        break;
                    case 'service-whatsapp':
                        sendSalonWhatsApp();
                        break;
                    case 'remove-cart-item':
                        removeFromCart(action.dataset.cartItemId);
                        break;
                    case 'retry-catalog':
                        void loadProducts();
                        break;
                    default:
                        break;
                }
            }

            const variantButton = target.closest('.size-btn');
            if (variantButton && dom.sizeOptionsBox.contains(variantButton)) {
                state.selectedVariant = variantButton.dataset.sizeValue;
                dom.sizeOptionsBox.querySelectorAll('.size-btn').forEach((button) => {
                    const isSelected = button === variantButton;
                    button.classList.toggle('selected', isSelected);
                    button.setAttribute('aria-pressed', String(isSelected));
                });
            }

            const quantityButton = target.closest('[data-qty-change]');
            if (quantityButton) updateQuantity(Number(quantityButton.dataset.qtyChange));
        });

        document.querySelectorAll('.nav-menu a:not(#openLocationModal)').forEach((link) => {
            link.addEventListener('click', () => {
                dom.menuToggle.checked = false;
            });
        });

        const locationLink = document.getElementById('openLocationModal');
        const locationTriggers = [locationLink, ...document.querySelectorAll('[data-location-trigger]')].filter(Boolean);
        locationTriggers.forEach((trigger) => {
            trigger.addEventListener('click', (event) => {
                event.preventDefault();
                openLocation(trigger);
            });
        });

        dom.locationModal.addEventListener('click', (event) => {
            if (event.target === dom.locationModal || event.target.closest('.location-close')) closeLocation();
        });
        dom.productModal.addEventListener('click', (event) => {
            if (event.target === dom.productModal) closeProductModal();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (dom.productModal.classList.contains('active')) closeProductModal();
                else if (dom.locationModal.classList.contains('active')) closeLocation();
                else if (dom.cartSidebar.classList.contains('active')) closeCart();
                else dom.menuToggle.checked = false;
            }
            trapDialogFocus(event);
        });
    }

    function initialize() {
        cacheDom();
        restoreCart();
        registerEvents();
        updateCartUI();
        subscribeToProductChanges();
        void loadProducts();
    }

    document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
