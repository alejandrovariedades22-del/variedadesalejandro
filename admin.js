(() => {
    'use strict';

    const categories = {
        'mujer-ropa': 'Ropa Mujer',
        'hombre-ropa': 'Ropa Hombre',
        'mujer-calzado': 'Calzado',
        'ninos-ropa': 'Niños',
        juguetes: 'Juguetes',
        hogar: 'Hogar y Comodidades',
        corporal: 'Productos de Belleza',
        belleza: 'Salón',
        electro: 'Electrodomésticos'
    };

    const state = {
        products: [],
        searchTerm: '',
        categoryFilter: 'all',
        statusFilter: 'all',
        editingId: null,
        selectedFile: null,
        previewObjectUrl: null,
        isInitialized: false,
        isSaving: false,
        pendingProductIds: new Set(),
        loadPromise: null,
        productsLoadState: 'idle',
        modalReturnFocus: null
    };

    const dom = {
        adminPanel: document.getElementById('adminPanel'),
        adminNotice: document.getElementById('adminNotice'),
        adminItemsList: document.getElementById('adminItemsList'),
        productCount: document.getElementById('productCount'),
        productSearch: document.getElementById('productSearch'),
        categoryFilter: document.getElementById('categoryFilter'),
        statusFilter: document.getElementById('statusFilter'),
        statTotalProducts: document.getElementById('statTotalProducts'),
        statActiveProducts: document.getElementById('statActiveProducts'),
        statHiddenProducts: document.getElementById('statHiddenProducts'),
        statOutOfStock: document.getElementById('statOutOfStock'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        sidebarBackdrop: document.getElementById('sidebarBackdrop'),
        productModal: document.getElementById('productModal'),
        productDialog: document.querySelector('.product-dialog'),
        productModalTitle: document.getElementById('productModalTitle'),
        productModalEyebrow: document.getElementById('productModalEyebrow'),
        productForm: document.getElementById('productForm'),
        productFormMessage: document.getElementById('productFormMessage'),
        editProductId: document.getElementById('editProductId'),
        formName: document.getElementById('formName'),
        formPrice: document.getElementById('formPrice'),
        productCategory: document.getElementById('productCategory'),
        formSizes: document.getElementById('formSizes'),
        formStock: document.getElementById('formStock'),
        stockField: document.getElementById('stockField'),
        formFile: document.getElementById('formFile'),
        filePickerText: document.getElementById('filePickerText'),
        imageHelp: document.getElementById('imageHelp'),
        imagePreview: document.getElementById('imagePreview'),
        imagePreviewImage: document.getElementById('imagePreviewImage'),
        saveProductButton: document.getElementById('saveProductButton')
    };

    function initialize() {
        if (state.isInitialized) return;
        state.isInitialized = true;
        registerEvents();
        synchronizeStockField();
    }

    function registerEvents() {
        dom.productSearch.addEventListener('input', handleSearchInput);
        dom.categoryFilter.addEventListener('change', handleCategoryFilter);
        dom.statusFilter.addEventListener('change', handleStatusFilter);
        dom.productForm.addEventListener('submit', handleProductSubmit);
        dom.formFile.addEventListener('change', handleImageSelection);
        dom.productCategory.addEventListener('change', synchronizeStockField);
        dom.adminItemsList.addEventListener('click', handleProductAction);
        dom.adminPanel.addEventListener('click', handlePanelAction);
        dom.productModal.addEventListener('click', handleModalBackdrop);
        dom.sidebarToggle.addEventListener('click', () => setSidebarOpen(!dom.adminPanel.classList.contains('is-sidebar-open')));
        dom.sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
        dom.adminPanel.querySelectorAll('[data-admin-nav]').forEach((link) => {
            link.addEventListener('click', () => {
                setActiveNavigation(link.dataset.adminNav);
                setSidebarOpen(false);
            });
        });
        document.addEventListener('keydown', handleGlobalKeydown);
    }

    function handleAdminAuthenticated() {
        initialize();
        void ensureProductsLoaded();
    }

    async function ensureProductsLoaded() {
        if (state.loadPromise) return state.loadPromise;
        state.loadPromise = loadProducts().finally(() => {
            state.loadPromise = null;
        });
        return state.loadPromise;
    }

    /* Supabase queries */
    async function loadProducts() {
        state.productsLoadState = 'loading';
        dom.adminItemsList.setAttribute('aria-busy', 'true');
        renderProducts();

        try {
            const { data, error } = await supabaseClient
                .from('productos')
                .select('*')
                .order('id', { ascending: true });

            if (error) throw error;
            state.products = Array.isArray(data) ? data : [];
            state.productsLoadState = 'success';
            renderDashboard();
            renderProducts();
            clearNotice();
        } catch (error) {
            state.productsLoadState = 'error';
            dom.statTotalProducts.textContent = '—';
            dom.statActiveProducts.textContent = '—';
            dom.statHiddenProducts.textContent = '—';
            dom.statOutOfStock.textContent = '—';
            showNotice(`No se pudieron cargar los productos: ${error.message}`, 'error');
            renderProducts();
        } finally {
            dom.adminItemsList.setAttribute('aria-busy', 'false');
        }
    }

    async function uploadProductImage(file) {
        const safeName = file.name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '')
            .replace(/[^a-zA-Z0-9._-]/g, '') || 'imagen';
        const fileName = `${Date.now()}_${safeName}`;
        const { error } = await supabaseClient.storage
            .from('productos')
            .upload(fileName, file);

        if (error) throw error;

        const { data } = supabaseClient.storage
            .from('productos')
            .getPublicUrl(fileName);

        if (!data?.publicUrl) throw new Error('No se pudo obtener la URL pública de la imagen.');
        return data.publicUrl;
    }

    async function insertProduct(productData) {
        const { data, error } = await supabaseClient
            .from('productos')
            .insert([productData])
            .select('*')
            .single();

        if (error) throw error;
        if (!data) throw new Error('Supabase no devolvió el producto creado.');
        return data;
    }

    async function updateProduct(id, productData) {
        const { data, error } = await supabaseClient
            .from('productos')
            .update(productData)
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw error;
        if (!data) throw new Error('No se encontró el producto actualizado.');
        return data;
    }

    async function deleteProductRecord(id) {
        const { error } = await supabaseClient
            .from('productos')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    async function updateProductStatusRecord(id, active) {
        const { error } = await supabaseClient
            .from('productos')
            .update({ activo: active })
            .eq('id', id);

        if (error) throw error;
    }

    /* Dashboard and product rendering */
    function renderDashboard() {
        const activeCount = state.products.filter((product) => product.activo === true).length;
        const hiddenCount = state.products.length - activeCount;
        const outOfStockCount = state.products.filter((product) => (
            product.categoria !== 'belleza' && Number(product.stock) <= 0
        )).length;

        dom.statTotalProducts.textContent = String(state.products.length);
        dom.statActiveProducts.textContent = String(activeCount);
        dom.statHiddenProducts.textContent = String(hiddenCount);
        dom.statOutOfStock.textContent = String(outOfStockCount);
    }

    function getVisibleProducts() {
        const normalizedQuery = normalizeText(state.searchTerm);

        return state.products.filter((product) => {
            const matchesName = normalizeText(product.nombre).includes(normalizedQuery);
            const matchesCategory = state.categoryFilter === 'all' || product.categoria === state.categoryFilter;
            const matchesStatus = state.statusFilter === 'all'
                || (state.statusFilter === 'active' && product.activo === true)
                || (state.statusFilter === 'hidden' && product.activo !== true);

            return matchesName && matchesCategory && matchesStatus;
        });
    }

    function renderProducts() {
        const fragment = document.createDocumentFragment();
        dom.adminItemsList.replaceChildren();

        if (state.productsLoadState === 'loading') {
            dom.productCount.textContent = 'Cargando productos…';
            const loadingState = createElement('div', 'empty-state', 'Cargando productos…');
            loadingState.setAttribute('role', 'listitem');
            fragment.appendChild(loadingState);
            dom.adminItemsList.appendChild(fragment);
            return;
        }

        if (state.productsLoadState === 'error') {
            dom.productCount.textContent = 'Error al cargar productos';
            const emptyState = createElement('div', 'empty-state');
            emptyState.setAttribute('role', 'listitem');
            emptyState.append(
                createElement('strong', '', 'No se pudo cargar el inventario'),
                createElement('span', '', 'Comprueba la conexión e inténtalo de nuevo.')
            );
            const retryButton = createElement('button', 'button button-light', 'Reintentar carga');
            retryButton.type = 'button';
            retryButton.dataset.action = 'retry-load';
            emptyState.appendChild(retryButton);
            fragment.appendChild(emptyState);
            dom.adminItemsList.appendChild(fragment);
            return;
        }

        const visibleProducts = getVisibleProducts();
        dom.productCount.textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? 'producto' : 'productos'}`;

        if (visibleProducts.length === 0) {
            const emptyState = createElement('div', 'empty-state');
            emptyState.setAttribute('role', 'listitem');
            const hasProducts = state.productsLoadState === 'success' && state.products.length > 0;
            const title = createElement('strong', '', hasProducts ? 'No hay coincidencias' : 'El inventario está vacío');
            const description = createElement('span', '', hasProducts
                ? 'Prueba con otro nombre o filtro.'
                : 'Añade un producto para comenzar a gestionar el catálogo.');
            emptyState.append(title, description);
            fragment.appendChild(emptyState);
            dom.adminItemsList.appendChild(fragment);
            return;
        }

        visibleProducts.forEach((product) => fragment.appendChild(createProductRow(product)));
        dom.adminItemsList.appendChild(fragment);
    }

    function createProductRow(product) {
        const row = createElement('article', 'product-row');
        row.setAttribute('role', 'listitem');

        const thumbnail = createElement('div', 'product-thumb');
        if (product.imagen) {
            const image = document.createElement('img');
            image.src = product.imagen;
            image.alt = `Imagen de ${product.nombre}`;
            image.loading = 'lazy';
            thumbnail.appendChild(image);
        } else {
            thumbnail.textContent = 'Sin imagen';
        }

        const details = createElement('div', 'product-details');
        details.append(
            createElement('p', 'product-category', categories[product.categoria] || product.categoria || 'Sin categoría'),
            createElement('h3', 'product-name', product.nombre || 'Producto sin nombre')
        );

        const price = createElement('span', 'product-price', formatPrice(product.precio));
        const stockText = product.categoria === 'belleza' ? 'N/A (Servicio)' : String(Number(product.stock) || 0);
        const stock = createElement('span', 'product-stock', product.categoria === 'belleza' ? stockText : `Stock: ${stockText}`);
        const status = createElement('span', 'product-status', product.activo === true ? 'Activo' : 'Oculto');

        if (product.activo !== true) status.classList.add('is-hidden');
        if (product.categoria !== 'belleza' && Number(product.stock) <= 0) stock.classList.add('product-stock-out');

        const actions = createElement('div', 'product-actions');
        const isPending = state.pendingProductIds.has(String(product.id));
        actions.append(
            createActionButton('Editar', 'edit', product, isPending),
            createActionButton(product.activo === true ? 'Ocultar' : 'Mostrar', 'toggle', product, isPending),
            createActionButton('Eliminar', 'delete', product, isPending)
        );

        row.dataset.productId = String(product.id);
        row.append(thumbnail, details, price, stock, status, actions);
        return row;
    }

    function createActionButton(label, action, product, disabled) {
        const button = createElement('button', 'action-button', label);
        button.type = 'button';
        button.dataset.action = action;
        button.dataset.productId = String(product.id);
        button.setAttribute('aria-label', `${label}: ${product.nombre}`);
        button.disabled = disabled;
        return button;
    }

    /* Product editing and form submission */
    function openProductEditor(product = null, trigger = document.activeElement) {
        state.editingId = product ? product.id : null;
        state.modalReturnFocus = trigger;
        clearFormMessage();
        clearSelectedImage(false);
        dom.productForm.reset();
        dom.editProductId.value = product ? String(product.id) : '';
        dom.productModalTitle.textContent = product ? 'Editar producto' : 'Añadir producto';
        dom.productModalEyebrow.textContent = product ? 'Editar catálogo' : 'Nuevo registro';
        dom.saveProductButton.textContent = product ? 'Guardar cambios' : 'Guardar producto';

        if (product) {
            dom.formName.value = product.nombre || '';
            dom.formPrice.value = product.precio ?? '';
            dom.productCategory.value = product.categoria || 'mujer-ropa';
            dom.formSizes.value = product.variante || '';
            dom.formStock.value = product.stock ?? 0;
            if (product.imagen) showImagePreview(product.imagen, false);
            dom.filePickerText.textContent = product.imagen ? 'Cambiar imagen' : 'Seleccionar imagen';
            dom.imageHelp.textContent = product.imagen
                ? 'La imagen guardada se conservará si no eliges otra.'
                : 'Selecciona una imagen para cargarla al almacenamiento de productos.';
        } else {
            dom.formStock.value = '0';
            dom.filePickerText.textContent = 'Seleccionar imagen';
            dom.imageHelp.textContent = 'Selecciona una imagen para cargarla al almacenamiento de productos.';
        }

        synchronizeStockField();
        dom.productModal.hidden = false;
        dom.productModal.classList.add('is-open');
        dom.productModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('admin-modal-open');
        requestAnimationFrame(() => dom.formName.focus());
    }

    function closeProductEditor(force = false) {
        if (state.isSaving && !force) return;
        if (dom.productModal.hidden) return;
        const returnFocus = state.modalReturnFocus;
        const editingId = state.editingId;
        dom.productModal.classList.remove('is-open');
        dom.productModal.setAttribute('aria-hidden', 'true');
        dom.productModal.hidden = true;
        document.body.classList.remove('admin-modal-open');
        dom.productForm.reset();
        dom.editProductId.value = '';
        state.editingId = null;
        clearSelectedImage(false);
        clearFormMessage();
        synchronizeStockField();
        state.modalReturnFocus = null;
        requestAnimationFrame(() => {
            if (!dom.productModal.hidden) return;
            if (returnFocus?.isConnected) {
                returnFocus.focus();
                return;
            }

            const editButton = editingId === null
                ? null
                : Array.from(dom.adminItemsList.querySelectorAll('button[data-action="edit"]'))
                    .find((button) => button.dataset.productId === String(editingId));
            const fallbackButton = dom.adminPanel.querySelector('[data-action="open-create"]');
            (editButton || fallbackButton)?.focus();
        });
    }

    async function handleProductSubmit(event) {
        event.preventDefault();
        if (state.isSaving || !dom.productForm.reportValidity()) return;

        const editingProduct = state.editingId === null
            ? null
            : state.products.find((product) => String(product.id) === String(state.editingId));

        if (state.editingId !== null && !editingProduct) {
            showFormMessage('No se encontró el producto que intentas editar. Recarga el inventario e inténtalo nuevamente.');
            return;
        }

        state.isSaving = true;
        setSaveButtonBusy(true);
        clearFormMessage();
        let recordSaved = false;

        try {
            const category = dom.productCategory.value;
            const imageUrl = state.selectedFile
                ? await uploadProductImage(state.selectedFile)
                : (editingProduct?.imagen || '');
            const productData = {
                nombre: dom.formName.value.trim(),
                precio: Number(dom.formPrice.value),
                categoria: category,
                stock: category === 'belleza' ? 0 : Number(dom.formStock.value || 0),
                variante: dom.formSizes.value.trim(),
                imagen: imageUrl,
                activo: editingProduct ? editingProduct.activo : true
            };

            const savedProduct = editingProduct
                ? await updateProduct(editingProduct.id, productData)
                : await insertProduct(productData);
            recordSaved = true;

            if (editingProduct) {
                state.products = state.products.map((product) => (
                    String(product.id) === String(savedProduct.id) ? savedProduct : product
                ));
            } else {
                state.products = [...state.products, savedProduct].sort(compareProductIds);
            }

            renderDashboard();
            renderProducts();
            closeProductEditor(true);
            showNotice(editingProduct ? 'Producto actualizado.' : 'Producto creado.', 'success');
        } catch (error) {
            const message = error?.message || 'Ocurrió un error inesperado.';
            if (recordSaved) {
                await loadProducts();
                closeProductEditor(true);
                showNotice(`El producto se guardó, pero no se pudo actualizar la lista: ${message}`, 'error');
            } else {
                showFormMessage(`No se pudo guardar el producto: ${message}`);
            }
        } finally {
            state.isSaving = false;
            setSaveButtonBusy(false);
        }
    }

    function setSaveButtonBusy(isBusy) {
        dom.productForm.querySelectorAll('input, select, button').forEach((control) => {
            const isServiceStock = control === dom.formStock && dom.productCategory.value === 'belleza';
            control.disabled = isBusy || isServiceStock;
        });
        dom.productModal.querySelectorAll('[data-action="close-modal"]').forEach((button) => {
            button.disabled = isBusy;
        });
        dom.saveProductButton.textContent = isBusy
            ? 'Guardando…'
            : state.editingId === null ? 'Guardar producto' : 'Guardar cambios';
    }

    /* Image selection and preview */
    async function handleImageSelection(event) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showFormMessage('Selecciona un archivo de imagen válido.');
            clearSelectedImage(true);
            return;
        }

        state.selectedFile = file;
        clearPreviewObjectUrl();
        state.previewObjectUrl = URL.createObjectURL(file);
        showImagePreview(state.previewObjectUrl, true);
        dom.filePickerText.textContent = file.name;
        clearFormMessage();
    }

    function showImagePreview(source, isObjectUrl) {
        dom.imagePreviewImage.src = source;
        dom.imagePreview.hidden = false;
        if (isObjectUrl) state.previewObjectUrl = source;
    }

    function clearSelectedImage(restoreSavedImage = true) {
        clearPreviewObjectUrl();
        state.selectedFile = null;
        dom.formFile.value = '';

        const product = state.editingId === null
            ? null
            : state.products.find((item) => String(item.id) === String(state.editingId));

        if (restoreSavedImage && product?.imagen) {
            showImagePreview(product.imagen, false);
            dom.filePickerText.textContent = 'Cambiar imagen';
        } else {
            dom.imagePreviewImage.removeAttribute('src');
            dom.imagePreview.hidden = true;
            dom.filePickerText.textContent = product?.imagen ? 'Cambiar imagen' : 'Seleccionar imagen';
        }
    }

    function clearPreviewObjectUrl() {
        if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
        state.previewObjectUrl = null;
    }

    function synchronizeStockField() {
        const isService = dom.productCategory.value === 'belleza';
        const label = dom.stockField.querySelector('.field-label');
        label.textContent = isService ? 'Stock (servicio)' : 'Stock disponible';
        dom.formStock.disabled = isService;
        if (isService) dom.formStock.value = '0';
    }

    /* Product actions and filters */
    async function handleProductAction(event) {
        const button = event.target.closest('button[data-action]');
        if (!button || !dom.adminItemsList.contains(button)) return;
        if (button.dataset.action === 'retry-load') {
            void ensureProductsLoaded();
            return;
        }
        if (!button.dataset.productId) return;

        const product = findProduct(button.dataset.productId);
        if (!product || state.pendingProductIds.has(String(product.id))) return;

        if (button.dataset.action === 'edit') {
            openProductEditor(product, button);
            return;
        }
        if (button.dataset.action === 'toggle') {
            await toggleProductStatus(product);
            return;
        }
        if (button.dataset.action === 'delete') await confirmAndDeleteProduct(product);
    }

    function handlePanelAction(event) {
        const button = event.target.closest('[data-action]');
        if (!button || !dom.adminPanel.contains(button)) return;

        if (button.dataset.action === 'open-create') openProductEditor(null, button);
        if (button.dataset.action === 'close-modal' && !state.isSaving) closeProductEditor();
        if (button.dataset.action === 'remove-image' && !state.isSaving) clearSelectedImage(true);
    }

    async function toggleProductStatus(product) {
        const id = String(product.id);
        state.pendingProductIds.add(id);
        renderProducts();

        try {
            const nextStatus = product.activo !== true;
            await updateProductStatusRecord(product.id, nextStatus);
            state.products = state.products.map((item) => (
                String(item.id) === id ? { ...item, activo: nextStatus } : item
            ));
            renderDashboard();
            renderProducts();
            showNotice(nextStatus ? 'Producto visible en la tienda.' : 'Producto oculto en la tienda.', 'success');
        } catch (error) {
            showNotice(`No se pudo cambiar el estado: ${error.message}`, 'error');
        } finally {
            state.pendingProductIds.delete(id);
            renderProducts();
        }
    }

    async function confirmAndDeleteProduct(product) {
        const accepted = window.confirm(`¿Eliminar “${product.nombre}” del inventario? Esta acción no se puede deshacer.`);
        if (!accepted) return;

        const id = String(product.id);
        state.pendingProductIds.add(id);
        renderProducts();

        try {
            await deleteProductRecord(product.id);
            state.products = state.products.filter((item) => String(item.id) !== id);
            renderDashboard();
            renderProducts();
            showNotice('Producto eliminado.', 'success');
        } catch (error) {
            showNotice(`No se pudo eliminar el producto: ${error.message}`, 'error');
        } finally {
            state.pendingProductIds.delete(id);
            renderProducts();
        }
    }

    function handleSearchInput(event) {
        state.searchTerm = event.currentTarget.value.trim();
        renderProducts();
    }

    function handleCategoryFilter(event) {
        state.categoryFilter = event.currentTarget.value;
        renderProducts();
    }

    function handleStatusFilter(event) {
        state.statusFilter = event.currentTarget.value;
        renderProducts();
    }

    /* Navigation and modal events */
    function setSidebarOpen(isOpen) {
        dom.adminPanel.classList.toggle('is-sidebar-open', isOpen);
        dom.sidebarToggle.setAttribute('aria-expanded', String(isOpen));
        dom.sidebarToggle.setAttribute('aria-label', isOpen ? 'Cerrar navegación' : 'Abrir navegación');
        dom.sidebarBackdrop.hidden = !isOpen;
    }

    function setActiveNavigation(section) {
        dom.adminPanel.querySelectorAll('[data-admin-nav]').forEach((link) => {
            link.classList.toggle('is-active', link.dataset.adminNav === section);
        });
    }

    function handleModalBackdrop(event) {
        if (!state.isSaving && event.target === dom.productModal) closeProductEditor();
    }

    function handleGlobalKeydown(event) {
        if (!dom.productModal.hidden) {
            if (event.key === 'Escape') {
                if (!state.isSaving) closeProductEditor();
                event.preventDefault();
                return;
            }

            if (event.key === 'Tab') trapModalFocus(event);
            return;
        }

        if (event.key !== 'Escape') return;
        if (dom.adminPanel.classList.contains('is-sidebar-open')) setSidebarOpen(false);
    }

    function trapModalFocus(event) {
        const focusableElements = Array.from(dom.productModal.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter((element) => element.getClientRects().length > 0);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) {
            event.preventDefault();
            dom.productDialog.focus();
            return;
        }

        if (!dom.productModal.contains(document.activeElement)) {
            event.preventDefault();
            firstElement.focus();
        } else if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    /* UI utilities */
    function findProduct(id) {
        return state.products.find((product) => String(product.id) === String(id));
    }

    function normalizeText(value) {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('es');
    }

    function formatPrice(value) {
        const price = Number(value);
        return Number.isFinite(price) ? `$${price.toFixed(2)}` : '$0.00';
    }

    function compareProductIds(first, second) {
        return Number(first.id) - Number(second.id);
    }

    function createElement(tag, className = '', text = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = String(text);
        return element;
    }

    function showNotice(message, type = 'info') {
        dom.adminNotice.textContent = message;
        dom.adminNotice.dataset.type = type;
        dom.adminNotice.hidden = false;
    }

    function clearNotice() {
        dom.adminNotice.textContent = '';
        dom.adminNotice.hidden = true;
        delete dom.adminNotice.dataset.type;
    }

    function showFormMessage(message) {
        dom.productFormMessage.textContent = message;
        dom.productFormMessage.hidden = false;
    }

    function clearFormMessage() {
        dom.productFormMessage.textContent = '';
        dom.productFormMessage.hidden = true;
    }

    window.addEventListener('adminAuthenticated', handleAdminAuthenticated);
    initialize();

    if (!dom.adminPanel.hidden) void ensureProductsLoaded();
})();
