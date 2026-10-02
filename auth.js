(() => {
    'use strict';

    const loginScreen = document.getElementById('loginScreen');
    const adminPanel = document.getElementById('adminPanel');
    const loginForm = document.getElementById('loginForm');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const loginSubmit = document.getElementById('loginSubmit');
    const loginMessage = document.getElementById('loginMessage');
    const logoutButton = document.getElementById('logoutButton');
    const adminNotice = document.getElementById('adminNotice');
    let currentUserId = null;

    function setAuthenticatedView(session) {
        const user = session?.user || null;
        const isAuthenticated = Boolean(user);
        const nextUserId = user?.id || null;
        const userChanged = nextUserId !== currentUserId;

        loginScreen.hidden = isAuthenticated;
        adminPanel.hidden = !isAuthenticated;
        currentUserId = nextUserId;

        if (isAuthenticated && userChanged) {
            window.dispatchEvent(new CustomEvent('adminAuthenticated', {
                detail: { user }
            }));
        }
    }

    function setLoginMessage(message) {
        loginMessage.textContent = message;
        loginMessage.hidden = !message;
    }

    function setAdminMessage(message, type = 'error') {
        adminNotice.textContent = message;
        adminNotice.dataset.type = type;
        adminNotice.hidden = !message;
    }

    async function checkSession() {
        try {
            const { data, error } = await supabaseClient.auth.getSession();
            if (error) throw error;
            setAuthenticatedView(data?.session || null);
        } catch (error) {
            console.error('Error comprobando la sesión:', error);
            setAuthenticatedView(null);
            setLoginMessage(`No se pudo verificar la sesión: ${error.message}`);
        }
    }

    async function handleLoginSubmit(event) {
        event.preventDefault();
        if (!loginForm.reportValidity()) return;

        loginSubmit.disabled = true;
        loginSubmit.textContent = 'Verificando…';
        setLoginMessage('');

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: loginEmail.value.trim(),
                password: loginPassword.value
            });

            if (error) throw error;
            if (!data?.session) throw new Error('No se pudo confirmar la sesión.');
            setAuthenticatedView(data.session);
            loginPassword.value = '';
        } catch (error) {
            setLoginMessage(`Error de acceso: ${error.message}`);
        } finally {
            loginSubmit.disabled = false;
            loginSubmit.textContent = 'Iniciar sesión';
        }
    }

    async function handleLogout() {
        logoutButton.disabled = true;
        setAdminMessage('');

        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
            setAuthenticatedView(null);
            loginPassword.value = '';
        } catch (error) {
            setAdminMessage(`No se pudo cerrar la sesión: ${error.message}`);
        } finally {
            logoutButton.disabled = false;
        }
    }

    loginForm.addEventListener('submit', handleLoginSubmit);
    logoutButton.addEventListener('click', handleLogout);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => setAuthenticatedView(session), 0);
    });

    void checkSession();
})();
