// Конфигурация Supabase
const SUPABASE_CONFIG = {
    url: 'https://hpambnfxxasxewmkpokn.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwYW1ibmZ4eGFzeGV3bWtwb2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4OTk2ODUsImV4cCI6MjA3NjQ3NTY4NX0.M_qS4vDz2J3OgPWqyAZo4BK91-IIfo_Jre18jHUt2s8'
};

// Инициализация Supabase
const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

// Состояние игры
const gameState = {
    players: {},
    currentPlayer: null,
    room: null,
    isModerator: false,
    chatMessages: [],
    lastBoostTime: 0,
    boostCooldown: 10000,
    boostDuration: 3000,
    isBoosting: false,
    lastActivity: Date.now(),
    gameLoopId: null,
    isChatCollapsed: false,
    // Новые состояния для множественных касаний
    activeTouches: new Map(),
    isAttacking: false
};

// Элементы DOM
const elements = {
    loginScreen: document.getElementById('loginScreen'),
    gameScreen: document.getElementById('gameScreen'),
    usernameInput: document.getElementById('usernameInput'),
    playButton: document.getElementById('playButton'),
    errorMessage: document.getElementById('errorMessage'),
    gameCanvas: document.getElementById('gameCanvas'),
    ctx: document.getElementById('gameCanvas').getContext('2d'),
    healthFill: document.getElementById('healthFill'),
    scoreElement: document.getElementById('score'),
    playerName: document.getElementById('playerName'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendMessage: document.getElementById('sendMessage'),
    roomNumber: document.getElementById('roomNumber'),
    playerCount: document.getElementById('playerCount'),
    boostButton: document.getElementById('boostButton'),
    attackButton: document.getElementById('attackButton'),
    moderatorPanel: document.getElementById('moderatorPanel'),
    clearChat: document.getElementById('clearChat'),
    deleteRoom: document.getElementById('deleteRoom'),
    switchRoom: document.getElementById('switchRoom'),
    kickPlayer: document.getElementById('kickPlayer'),
    leaveGame: document.getElementById('leaveGame'),
    toggleChat: document.getElementById('toggleChat'),
    chatContainer: document.getElementById('chatContainer'),
    playerList: document.getElementById('playerList'),
    playerListContent: document.getElementById('playerListContent'),
    kickModal: document.getElementById('kickModal'),
    kickPlayerList: document.getElementById('kickPlayerList'),
    cancelKick: document.getElementById('cancelKick')
};

// Джойстик
const joystick = {
    base: document.getElementById('joystickBase'),
    handle: document.getElementById('joystickHandle'),
    active: false,
    position: { x: 0, y: 0 },
    direction: { x: 0, y: 0 },
    baseRect: null,
    touchId: null // Для отслеживания конкретного касания джойстика
};

// Размеры холста
function resizeCanvas() {
    elements.gameCanvas.width = window.innerWidth;
    elements.gameCanvas.height = window.innerHeight;
}

// Инициализация игры
async function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Проверка активности
    setInterval(checkActivity, 30000);
    
    // Автоматическая очистка каждую минуту
    setInterval(performAutoCleanup, 60000);
    
    // Обработчики событий
    setupEventListeners();
    
    // Запуск игрового цикла
    gameState.gameLoopId = requestAnimationFrame(gameLoop);
    
    console.log('PUUPI Game initialized');
}

// Автоматическая очистка базы данных
async function performAutoCleanup() {
    try {
        const { data, error } = await supabase.rpc('perform_cleanup');
        if (!error) {
            console.log('Auto cleanup performed:', data);
        }
    } catch (error) {
        console.log('Auto cleanup not available, using client-side cleanup');
        await clientSideCleanup();
    }
}

// Клиентская очистка (резервный вариант)
async function clientSideCleanup() {
    await supabase
        .from('chat_messages')
        .delete()
        .lt('expires_at', new Date().toISOString());
    
    await supabase
        .from('players')
        .update({ is_active: false })
        .lt('last_active', new Date(Date.now() - 120000).toISOString());
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Вход в игру
    elements.playButton.addEventListener('click', handleLogin);
    elements.usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    
    // Чат
    elements.sendMessage.addEventListener('click', sendChatMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    elements.toggleChat.addEventListener('click', toggleChat);
    
    // Действия - ОБНОВЛЕННЫЕ ОБРАБОТЧИКИ ДЛЯ МНОЖЕСТВЕННЫХ КАСАНИЙ
    elements.boostButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        activateBoost();
    }, { passive: false });
    
    elements.boostButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        activateBoost();
    });
    
    elements.attackButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startAttack();
    }, { passive: false });
    
    elements.attackButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startAttack();
    });
    
    elements.attackButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopAttack();
    }, { passive: false });
    
    elements.attackButton.addEventListener('mouseup', (e) => {
        e.preventDefault();
        stopAttack();
    });
    
    elements.attackButton.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        stopAttack();
    }, { passive: false });
    
    // Модераторские кнопки
    elements.clearChat.addEventListener('click', clearChat);
    elements.deleteRoom.addEventListener('click', deleteRoom);
    elements.switchRoom.addEventListener('click', switchRoom);
    elements.kickPlayer.addEventListener('click', showKickModal);
    elements.cancelKick.addEventListener('click', hideKickModal);
    
    // Выход из игры
    elements.leaveGame.addEventListener('click', leaveGame);
    
    // Инициализация джойстика с поддержкой множественных касаний
    initJoystick();
    
    // Глобальные обработчики активности
    document.addEventListener('mousedown', updateActivity);
    document.addEventListener('touchstart', updateActivity);
    document.addEventListener('keydown', updateActivity);
}

// Переключение чата
function toggleChat() {
    gameState.isChatCollapsed = !gameState.isChatCollapsed;
    elements.chatContainer.classList.toggle('chat-collapsed', gameState.isChatCollapsed);
    
    if (gameState.isChatCollapsed) {
        elements.toggleChat.textContent = '+';
    } else {
        elements.toggleChat.textContent = '−';
    }
    
    updateActivity();
}

// Обновление времени активности
function updateActivity() {
    gameState.lastActivity = Date.now();
}

// Проверка активности
function checkActivity() {
    const now = Date.now();
    if (now - gameState.lastActivity > 120000) {
        if (gameState.currentPlayer) {
            leaveGame();
        }
    }
}

// Обработка входа в игру
async function handleLogin() {
    const username = elements.usernameInput.value.trim();
    
    if (!username) {
        showError('Введите имя пользователя');
        return;
    }
    
    if (username.length > 14) {
        showError('Имя не должно превышать 14 символов');
        return;
    }
    
    if (username === 'iammoderator') {
        await joinAsModerator();
        return;
    }
    
    const { data: existingPlayer, error } = await supabase
        .from('players')
        .select('id, username, last_active')
        .eq('username', username)
        .eq('is_active', true)
        .single();
    
    if (existingPlayer && !error) {
        const lastActive = new Date(existingPlayer.last_active);
        const now = new Date();
        const diffMinutes = (now - lastActive) / (1000 * 60);
        
        if (diffMinutes < 2) {
            showError('Это имя уже занято');
            return;
        } else {
            await supabase
                .from('players')
                .update({ is_active: false })
                .eq('id', existingPlayer.id);
        }
    }
    
    await joinAsPlayer(username);
}

// Вход как игрок
async function joinAsPlayer(username) {
    try {
        await performAutoCleanup();
        
        const { data: newPlayer, error } = await supabase
            .from('players')
            .insert([
                {
                    username: username,
                    score: 0,
                    size: 20,
                    health: 100,
                    is_active: true,
                    last_active: new Date().toISOString(),
                    room_id: await getAvailableRoom(),
                    color: generatePlayerColor(),
                    x: Math.random() * 800 + 100,
                    y: Math.random() * 600 + 100
                }
            ])
            .select()
            .single();
        
        if (error) throw error;
        
        gameState.currentPlayer = {
            id: generatePlayerId(),
            username: username,
            x: newPlayer.x,
            y: newPlayer.y,
            color: newPlayer.color,
            size: newPlayer.size,
            health: newPlayer.health,
            score: newPlayer.score,
            roomId: newPlayer.room_id,
            lastActivity: Date.now(),
            isModerator: false,
            dbId: newPlayer.id
        };
        
        gameState.players[gameState.currentPlayer.id] = gameState.currentPlayer;
        gameState.room = { id: newPlayer.room_id };
        
        switchToGameScreen();
        startGameSync();
        
        addChatMessage(`${username} присоединился к игре`, false, true);
        
    } catch (error) {
        console.error('Ошибка при присоединении:', error);
        showError('Ошибка при присоединении к игре');
    }
}

// Вход как модератор
async function joinAsModerator() {
    gameState.currentPlayer = {
        id: generatePlayerId(),
        username: 'MODERATOR',
        x: Math.random() * (elements.gameCanvas.width - 100) + 50,
        y: Math.random() * (elements.gameCanvas.height - 100) + 50,
        color: '#FFD700',
        size: 25,
        health: null,
        score: 0,
        roomId: await getAvailableRoom(),
        lastActivity: Date.now(),
        isModerator: true
    };
    
    gameState.players[gameState.currentPlayer.id] = gameState.currentPlayer;
    gameState.room = { id: gameState.currentPlayer.roomId };
    gameState.isModerator = true;
    
    switchToGameScreen();
    startGameSync();
    
    addChatMessage('Модератор присоединился к игре', true, true);
}

// Получение доступной комнаты
async function getAvailableRoom() {
    try {
        const { data: roomCounts, error } = await supabase
            .from('players')
            .select('room_id')
            .eq('is_active', true)
            .gt('last_active', new Date(Date.now() - 120000).toISOString());
        
        if (error) throw error;
        
        const roomPlayers = {};
        roomCounts.forEach(player => {
            roomPlayers[player.room_id] = (roomPlayers[player.room_id] || 0) + 1;
        });
        
        for (let roomId = 1; roomId <= 10; roomId++) {
            if (!roomPlayers[roomId] || roomPlayers[roomId] < 12) {
                return roomId;
            }
        }
        
        return (Math.max(...Object.keys(roomPlayers).map(Number)) || 0) + 1;
        
    } catch (error) {
        console.error('Error getting available room:', error);
        return 1;
    }
}

// Генерация ID игрока
function generatePlayerId() {
    return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Генерация уникального цвета
function generatePlayerColor() {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
        '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Показать ошибку
function showError(message) {
    elements.errorMessage.textContent = message;
    setTimeout(() => {
        elements.errorMessage.textContent = '';
    }, 3000);
}

// Переключение на игровой экран
function switchToGameScreen() {
    elements.loginScreen.classList.remove('active');
    elements.gameScreen.classList.add('active');
    
    if (gameState.isModerator) {
        elements.moderatorPanel.classList.remove('hidden');
    }
    
    elements.playerName.textContent = gameState.currentPlayer.username;
    updatePlayerUI();
}

// Запуск синхронизации игры
function startGameSync() {
    loadGameState();
    loadChatMessages();
    
    setInterval(syncGameState, 2000);
    setInterval(cleanupInactivePlayers, 10000);
    setInterval(loadChatMessages, 3000);
}

// Загрузка состояния игры
async function loadGameState() {
    if (!gameState.room) return;
    
    try {
        const { data: players, error } = await supabase
            .from('players')
            .select('*')
            .eq('room_id', gameState.room.id)
            .eq('is_active', true)
            .gt('last_active', new Date(Date.now() - 120000).toISOString());
        
        if (error) throw error;
        
        const newPlayers = {};
        
        players.forEach(player => {
            if (player.id !== gameState.currentPlayer?.dbId) {
                const playerId = 'db_' + player.id;
                newPlayers[playerId] = {
                    id: playerId,
                    username: player.username,
                    x: player.x || Math.random() * (elements.gameCanvas.width - 100) + 50,
                    y: player.y || Math.random() * (elements.gameCanvas.height - 100) + 50,
                    color: player.color || generatePlayerColor(),
                    size: player.size || 20,
                    health: player.health || 100,
                    score: player.score || 0,
                    roomId: player.room_id,
                    lastActivity: new Date(player.last_active).getTime(),
                    isModerator: player.username === 'MODERATOR',
                    dbId: player.id
                };
                
                if (!gameState.players[playerId]) {
                    addChatMessage(`${player.username} присоединился к игре`, false, true);
                }
            }
        });
        
        if (gameState.currentPlayer) {
            newPlayers[gameState.currentPlayer.id] = gameState.currentPlayer;
        }
        
        gameState.players = newPlayers;
        
        updateRoomInfo();
        updatePlayerList();
        
    } catch (error) {
        console.error('Ошибка загрузки игроков:', error);
    }
}

// Синхронизация состояния игры
async function syncGameState() {
    if (!gameState.currentPlayer || !gameState.currentPlayer.dbId) return;
    
    try {
        await supabase
            .from('players')
            .update({
                x: gameState.currentPlayer.x,
                y: gameState.currentPlayer.y,
                score: gameState.currentPlayer.score,
                size: gameState.currentPlayer.size,
                health: gameState.currentPlayer.health,
                last_active: new Date().toISOString()
            })
            .eq('id', gameState.currentPlayer.dbId);
        
    } catch (error) {
        console.error('Ошибка синхронизации:', error);
    }
}

// Очистка неактивных игроков
async function cleanupInactivePlayers() {
    try {
        const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();
        
        const { data: inactivePlayers, error } = await supabase
            .from('players')
            .select('id, username')
            .eq('is_active', true)
            .lt('last_active', twoMinutesAgo);
        
        if (error) throw error;
        
        for (const player of inactivePlayers) {
            await supabase
                .from('players')
                .update({ is_active: false })
                .eq('id', player.id);
            
            const playerId = 'db_' + player.id;
            if (gameState.players[playerId]) {
                addChatMessage(`${player.username} вышел из игры (неактивность)`, false, true);
                delete gameState.players[playerId];
            }
        }
        
        updateRoomInfo();
        updatePlayerList();
        
    } catch (error) {
        console.error('Ошибка очистки неактивных игроков:', error);
    }
}

// Инициализация джойстика с поддержкой множественных касаний
function initJoystick() {
    let startX, startY;
    
    // Обработчики для касаний (с поддержкой множественных)
    joystick.base.addEventListener('touchstart', handleTouchStart, { passive: false });
    joystick.base.addEventListener('touchmove', handleTouchMove, { passive: false });
    joystick.base.addEventListener('touchend', handleTouchEnd);
    joystick.base.addEventListener('touchcancel', handleTouchEnd);
    
    // Обработчики для мыши
    joystick.base.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    function handleTouchStart(e) {
        e.preventDefault();
        // Используем первое касание для джойстика
        if (joystick.touchId === null) {
            const touch = e.touches[0];
            joystick.touchId = touch.identifier;
            startX = touch.clientX;
            startY = touch.clientY;
            joystick.baseRect = joystick.base.getBoundingClientRect();
            joystick.active = true;
            updateJoystickPosition(startX, startY);
        }
    }
    
    function handleTouchMove(e) {
        if (!joystick.active || joystick.touchId === null) return;
        e.preventDefault();
        
        // Находим касание джойстика
        for (let touch of e.touches) {
            if (touch.identifier === joystick.touchId) {
                updateJoystickPosition(touch.clientX, touch.clientY);
                break;
            }
        }
    }
    
    function handleTouchEnd(e) {
        if (joystick.touchId === null) return;
        
        // Проверяем, было ли это касание джойстика
        let touchFound = false;
        for (let touch of e.changedTouches) {
            if (touch.identifier === joystick.touchId) {
                touchFound = true;
                break;
            }
        }
        
        if (touchFound) {
            joystick.active = false;
            joystick.touchId = null;
            resetJoystick();
        }
    }
    
    function handleMouseDown(e) {
        startX = e.clientX;
        startY = e.clientY;
        joystick.baseRect = joystick.base.getBoundingClientRect();
        joystick.active = true;
        updateJoystickPosition(startX, startY);
    }
    
    function handleMouseMove(e) {
        if (!joystick.active) return;
        updateJoystickPosition(e.clientX, e.clientY);
    }
    
    function handleMouseUp() {
        joystick.active = false;
        resetJoystick();
    }
    
    function updateJoystickPosition(clientX, clientY) {
        if (!joystick.baseRect) return;
        
        const baseCenterX = joystick.baseRect.left + joystick.baseRect.width / 2;
        const baseCenterY = joystick.baseRect.top + joystick.baseRect.height / 2;
        
        let deltaX = clientX - baseCenterX;
        let deltaY = clientY - baseCenterY;
        
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const maxDistance = joystick.baseRect.width / 2;
        
        if (distance > maxDistance) {
            deltaX = (deltaX / distance) * maxDistance;
            deltaY = (deltaY / distance) * maxDistance;
        }
        
        joystick.handle.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
        
        joystick.direction.x = deltaX / maxDistance;
        joystick.direction.y = deltaY / maxDistance;
        
        updateActivity();
    }
    
    function resetJoystick() {
        joystick.handle.style.transform = 'translate(-50%, -50%)';
        joystick.direction.x = 0;
        joystick.direction.y = 0;
    }
}

// Активация ускорения - ОБНОВЛЕНА ДЛЯ МНОЖЕСТВЕННЫХ КАСАНИЙ
function activateBoost() {
    const now = Date.now();
    if (now - gameState.lastBoostTime < gameState.boostCooldown) return;
    
    gameState.lastBoostTime = now;
    gameState.isBoosting = true;
    
    elements.boostButton.classList.add('boost-active');
    elements.boostButton.disabled = true;
    
    setTimeout(() => {
        gameState.isBoosting = false;
        elements.boostButton.classList.remove('boost-active');
    }, gameState.boostDuration);
    
    setTimeout(() => {
        elements.boostButton.disabled = false;
    }, gameState.boostCooldown);
    
    updateActivity();
}

// НАЧАЛО АТАКИ - новая функция для непрерывной атаки
function startAttack() {
    if (!gameState.currentPlayer || gameState.isAttacking) return;
    
    gameState.isAttacking = true;
    elements.attackButton.classList.add('attack-animation');
    
    // Запускаем цикл атаки
    performAttackCycle();
    
    updateActivity();
}

// ОКОНЧАНИЕ АТАКИ
function stopAttack() {
    gameState.isAttacking = false;
    elements.attackButton.classList.remove('attack-animation');
}

// ЦИКЛ АТАКИ - непрерывная атака пока кнопка нажата
function performAttackCycle() {
    if (!gameState.isAttacking || !gameState.currentPlayer) return;
    
    performAttack();
    
    // Повторяем атаку каждые 500мс пока кнопка нажата
    setTimeout(() => {
        if (gameState.isAttacking) {
            performAttackCycle();
        }
    }, 500);
}

// Выполнение атаки (основная логика)
function performAttack() {
    if (!gameState.currentPlayer) return;
    
    const attackRadius = 60;
    let hitPlayer = null;
    
    Object.values(gameState.players).forEach(player => {
        if (player.id === gameState.currentPlayer.id || player.health === null) return;
        
        const distance = Math.sqrt(
            Math.pow(player.x - gameState.currentPlayer.x, 2) + 
            Math.pow(player.y - gameState.currentPlayer.y, 2)
        );
        
        if (distance < attackRadius + player.size) {
            hitPlayer = player;
        }
    });
    
    if (hitPlayer) {
        hitPlayer.health -= 10;
        
        if (hitPlayer.health <= 0) {
            hitPlayer.health = 100;
            hitPlayer.size = Math.max(10, hitPlayer.size - 5);
            
            gameState.currentPlayer.score += 50;
            gameState.currentPlayer.size += 5;
            
            addChatMessage(
                `${gameState.currentPlayer.username} победил ${hitPlayer.username}!`,
                false,
                true
            );
        } else {
            addChatMessage(
                `${gameState.currentPlayer.username} атаковал ${hitPlayer.username}`,
                false,
                true
            );
        }
        
        updatePlayerUI();
        syncPlayerHit(hitPlayer);
    }
    
    updateActivity();
}

// Синхронизация попадания по игроку
async function syncPlayerHit(targetPlayer) {
    if (!targetPlayer.dbId) return;
    
    try {
        await supabase
            .from('players')
            .update({
                health: targetPlayer.health,
                size: targetPlayer.size
            })
            .eq('id', targetPlayer.dbId);
    } catch (error) {
        console.error('Ошибка синхронизации урона:', error);
    }
}

// Отправка сообщения в чат
async function sendChatMessage() {
    const message = elements.chatInput.value.trim();
    if (!message || !gameState.currentPlayer) return;
    
    try {
        const { error } = await supabase
            .from('chat_messages')
            .insert([
                {
                    username: gameState.currentPlayer.username,
                    message: message,
                    room_id: gameState.room.id,
                    is_moderator: gameState.currentPlayer.isModerator,
                    expires_at: new Date(Date.now() + 60000).toISOString()
                }
            ]);
        
        if (error) throw error;
        
        addChatMessage(
            `${gameState.currentPlayer.username}: ${message}`,
            gameState.currentPlayer.isModerator
        );
        
        elements.chatInput.value = '';
        updateActivity();
        
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
    }
}

// Загрузка сообщений чата
async function loadChatMessages() {
    if (!gameState.room || gameState.isChatCollapsed) return;
    
    try {
        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('room_id', gameState.room.id)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: true })
            .limit(50);
        
        if (error) throw error;
        
        if (messages.length > 0) {
            elements.chatMessages.innerHTML = '';
            messages.forEach(msg => {
                addChatMessage(
                    `${msg.username}: ${msg.message}`,
                    msg.is_moderator,
                    false,
                    false
                );
            });
        }
        
    } catch (error) {
        console.error('Ошибка загрузки чата:', error);
    }
}

// Добавление сообщения в чат
function addChatMessage(message, isModerator = false, isSystem = false, animate = true) {
    if (gameState.isChatCollapsed) return;
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    
    if (isModerator) {
        messageElement.classList.add('moderator');
    } else if (isSystem) {
        messageElement.classList.add('system');
    }
    
    if (message.includes('присоединился')) {
        messageElement.classList.add('player-join');
    } else if (message.includes('покинул') || message.includes('вышел')) {
        messageElement.classList.add('player-left');
    }
    
    messageElement.textContent = message;
    
    if (animate) {
        messageElement.style.animation = 'messageAppear 0.3s ease';
    }
    
    elements.chatMessages.appendChild(messageElement);
    
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    
    const messages = elements.chatMessages.children;
    if (messages.length > 100) {
        messages[0].remove();
    }
}

// Очистка чата (для модератора)
async function clearChat() {
    if (!gameState.isModerator) return;
    
    try {
        await supabase
            .from('chat_messages')
            .delete()
            .eq('room_id', gameState.room.id);
        
        elements.chatMessages.innerHTML = '';
        addChatMessage('Чат был очищен модератором', false, true);
        updateActivity();
        
    } catch (error) {
        console.error('Ошибка очистки чата:', error);
    }
}

// Удаление комнаты (для модератора)
async function deleteRoom() {
    if (!gameState.isModerator) return;
    
    try {
        await supabase
            .from('players')
            .update({ is_active: false })
            .eq('room_id', gameState.room.id);
        
        await supabase
            .from('chat_messages')
            .delete()
            .eq('room_id', gameState.room.id);
        
        addChatMessage('Комната была удалена модератором', false, true);
        
        setTimeout(() => {
            alert('Комната удалена модератором. Игра будет перезагружена.');
            window.location.reload();
        }, 2000);
        
        updateActivity();
        
    } catch (error) {
        console.error('Ошибка удаления комнаты:', error);
    }
}

// Переключение комнаты (для модератора)
async function switchRoom() {
    if (!gameState.isModerator) return;
    
    try {
        const newRoomId = gameState.room.id === 1 ? 2 : 1;
        gameState.room.id = newRoomId;
        gameState.currentPlayer.roomId = newRoomId;
        
        if (gameState.currentPlayer.dbId) {
            await supabase
                .from('players')
                .update({ room_id: newRoomId })
                .eq('id', gameState.currentPlayer.dbId);
        }
        
        gameState.players = { [gameState.currentPlayer.id]: gameState.currentPlayer };
        
        addChatMessage(`Модератор перешел в комнату ${newRoomId}`, true);
        updateRoomInfo();
        updatePlayerList();
        loadChatMessages();
        updateActivity();
        
    } catch (error) {
        console.error('Ошибка переключения комнаты:', error);
    }
}

// Показать модальное окно кика игрока
function showKickModal() {
    if (!gameState.isModerator) return;
    
    elements.kickPlayerList.innerHTML = '';
    
    Object.values(gameState.players).forEach(player => {
        if (player.id === gameState.currentPlayer.id || player.isModerator) return;
        
        const playerElement = document.createElement('div');
        playerElement.classList.add('kick-player-item');
        playerElement.innerHTML = `
            <div class="kick-player-color" style="background: ${player.color};"></div>
            <span>${player.username}</span>
        `;
        
        playerElement.addEventListener('click', () => kickPlayer(player));
        elements.kickPlayerList.appendChild(playerElement);
    });
    
    elements.kickModal.classList.remove('hidden');
    updateActivity();
}

// Скрыть модальное окно кика
function hideKickModal() {
    elements.kickModal.classList.add('hidden');
}

// Кик игрока
async function kickPlayer(player) {
    if (!gameState.isModerator) return;
    
    try {
        if (player.dbId) {
            await supabase
                .from('players')
                .update({ is_active: false })
                .eq('id', player.dbId);
        }
        
        delete gameState.players[player.id];
        
        addChatMessage(`Модератор кикнул игрока ${player.username}`, true);
        hideKickModal();
        updateRoomInfo();
        updatePlayerList();
        updateActivity();
        
    } catch (error) {
        console.error('Ошибка кика игрока:', error);
    }
}

// Выход из игры
async function leaveGame() {
    try {
        if (gameState.currentPlayer && gameState.currentPlayer.dbId) {
            await supabase
                .from('players')
                .update({ is_active: false })
                .eq('id', gameState.currentPlayer.dbId);
        }
        
        if (gameState.gameLoopId) {
            cancelAnimationFrame(gameState.gameLoopId);
        }
        
        window.location.reload();
        
    } catch (error) {
        console.error('Ошибка выхода из игры:', error);
        window.location.reload();
    }
}

// Обновление информации о комнате
function updateRoomInfo() {
    elements.roomNumber.textContent = gameState.room ? gameState.room.id : '1';
    const playerCount = Object.keys(gameState.players).length;
    elements.playerCount.textContent = playerCount;
    
    if (playerCount > 1) {
        elements.playerList.classList.remove('hidden');
    } else {
        elements.playerList.classList.add('hidden');
    }
}

// Обновление списка игроков
function updatePlayerList() {
    elements.playerListContent.innerHTML = '';
    
    Object.values(gameState.players).forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.classList.add('player-item');
        if (player.isModerator) {
            playerElement.classList.add('player-moderator');
        }
        
        playerElement.innerHTML = `
            <div class="player-color" style="background: ${player.color};"></div>
            <span>${player.username}</span>
            ${player.health !== null ? `<small>(${player.health} HP)</small>` : ''}
        `;
        
        elements.playerListContent.appendChild(playerElement);
    });
}

// Обновление UI игрока
function updatePlayerUI() {
    if (!gameState.currentPlayer) return;
    
    elements.healthFill.style.width = `${gameState.currentPlayer.health}%`;
    elements.scoreElement.textContent = `Очки: ${gameState.currentPlayer.score}`;
    
    if (gameState.currentPlayer.health < 30) {
        elements.healthFill.style.background = 'var(--health-red)';
    } else if (gameState.currentPlayer.health < 70) {
        elements.healthFill.style.background = 'var(--health-orange)';
    } else {
        elements.healthFill.style.background = 'linear-gradient(90deg, var(--health-red), var(--health-orange))';
    }
}

// Игровой цикл
function gameLoop() {
    elements.ctx.fillStyle = '#000';
    elements.ctx.fillRect(0, 0, elements.gameCanvas.width, elements.gameCanvas.height);
    
    if (gameState.currentPlayer && joystick.active) {
        const speed = gameState.isBoosting ? 8 : 4;
        gameState.currentPlayer.x += joystick.direction.x * speed;
        gameState.currentPlayer.y += joystick.direction.y * speed;
        
        const player = gameState.currentPlayer;
        if (player.x < player.size) {
            player.x = player.size;
        } else if (player.x > elements.gameCanvas.width - player.size) {
            player.x = elements.gameCanvas.width - player.size;
        }
        
        if (player.y < player.size) {
            player.y = player.size;
        } else if (player.y > elements.gameCanvas.height - player.size) {
            player.y = elements.gameCanvas.height - player.size;
        }
        
        checkCollisions(gameState.currentPlayer);
    }
    
    Object.values(gameState.players).forEach(player => {
        drawPlayer(player);
    });
    
    gameState.gameLoopId = requestAnimationFrame(gameLoop);
}

// Отрисовка игрока
function drawPlayer(player) {
    const { x, y, color, username, size, health, isModerator } = player;
    
    elements.ctx.beginPath();
    elements.ctx.arc(x, y, size, 0, Math.PI * 2);
    elements.ctx.fillStyle = color;
    elements.ctx.fill();
    
    if (player.isBoosting) {
        elements.ctx.beginPath();
        elements.ctx.arc(x, y, size + 8, 0, Math.PI * 2);
        elements.ctx.strokeStyle = '#00ffcc';
        elements.ctx.lineWidth = 3;
        elements.ctx.stroke();
    }
    
    if (isModerator) {
        elements.ctx.beginPath();
        elements.ctx.arc(x, y, size + 2, 0, Math.PI * 2);
        elements.ctx.strokeStyle = '#FFD700';
        elements.ctx.lineWidth = 3;
        elements.ctx.stroke();
    }
    
    elements.ctx.font = '14px Roboto';
    elements.ctx.fillStyle = '#fff';
    elements.ctx.textAlign = 'center';
    elements.ctx.textBaseline = 'bottom';
    
    elements.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    elements.ctx.shadowBlur = 4;
    elements.ctx.shadowOffsetX = 2;
    elements.ctx.shadowOffsetY = 2;
    
    elements.ctx.fillText(username, x, y - size - 5);
    
    elements.ctx.shadowColor = 'transparent';
    elements.ctx.shadowBlur = 0;
    elements.ctx.shadowOffsetX = 0;
    elements.ctx.shadowOffsetY = 0;
    
    if (!isModerator && health < 100) {
        elements.ctx.font = '12px Roboto';
        elements.ctx.fillStyle = '#ff4757';
        elements.ctx.textBaseline = 'top';
        elements.ctx.fillText(`HP: ${health}`, x, y + size + 5);
    }
}

// Проверка столкновений
function checkCollisions(player) {
    Object.values(gameState.players).forEach(otherPlayer => {
        if (otherPlayer.id === player.id) return;
        
        const distance = Math.sqrt(
            Math.pow(otherPlayer.x - player.x, 2) + 
            Math.pow(otherPlayer.y - player.y, 2)
        );
        
        const minDistance = player.size + otherPlayer.size;
        
        if (distance < minDistance) {
            const angle = Math.atan2(otherPlayer.y - player.y, otherPlayer.x - player.x);
            const force = 6;
            
            player.x -= Math.cos(angle) * force;
            player.y -= Math.sin(angle) * force;
            otherPlayer.x += Math.cos(angle) * force;
            otherPlayer.y += Math.sin(angle) * force;
            
            [player, otherPlayer].forEach(p => {
                if (p.x < p.size) p.x = p.size;
                if (p.x > elements.gameCanvas.width - p.size) p.x = elements.gameCanvas.width - p.size;
                if (p.y < p.size) p.y = p.size;
                if (p.y > elements.gameCanvas.height - p.size) p.y = elements.gameCanvas.height - p.size;
            });
        }
    });
}

// Запуск игры при загрузке страницы
window.addEventListener('load', init);
