document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('command-input');
    const inputDisplay = document.getElementById('input-display');
    const inputWrapper = document.querySelector('.input-wrapper');
    const output = document.getElementById('output');
    const screen = document.getElementById('crt-screen');

    let messageQueue = [];
    let isTyping = false;
    let skipCurrent = false;
    let userScrolledUp = false;
    let gameStarted = false;

    // Ocultar input inicialmente (solo para la intro)
    screen.classList.add('intro-hide');

    // --- AUDIO (Sencillo) ---
    const audio = {
        ctx: null,
        enabled: true, // Activado por defecto
        init() {
            this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
            if (this.ctx.state === 'suspended') this.ctx.resume();
        },
        beep(f, type, vol, dur) {
            this.init();
            const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(f, this.ctx.currentTime);
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(); osc.stop(this.ctx.currentTime + dur);
        },
        playKey() {
            if (!this.enabled) return;
            // Más agudo (8000Hz) y volumen reducido
            this.beep(200 + Math.random() * 50, 'square', 0.025, 0.02);
            this.beep(8000 + Math.random() * 1000, 'sine', 0.025, 0.01);
        },
        matrixSoundInterval: null,
        startMatrixAudio() {
            if (!this.enabled) return;
            this.init();
            this.stopMatrixAudio();

            // Mismo sonido de tecleo que cuando la terminal escribe texto
            this.matrixSoundInterval = setInterval(() => {
                this.playKey();
            }, 35);
        },
        stopMatrixAudio() {
            if (this.matrixSoundInterval) {
                clearInterval(this.matrixSoundInterval);
                this.matrixSoundInterval = null;
            }
        }
    };

    // Evento F1 eliminado


    // Focus input and init audio when clicking anywhere on screen
    screen.addEventListener('click', () => {
        audio.init();
        input.focus();
    });

    function updateInputDisplay() {
        const val = input.value;
        const caretPos = input.selectionStart;
        inputDisplay.innerHTML = '';

        if (caretPos > 0) {
            const preSpan = document.createElement('span');
            preSpan.textContent = val.substring(0, caretPos);
            inputDisplay.appendChild(preSpan);
        }

        const cursorSpan = document.createElement('span');
        cursorSpan.className = 'cursor';
        if (caretPos < val.length) {
            cursorSpan.textContent = val[caretPos];
        } else {
            cursorSpan.innerHTML = '&nbsp;';
        }
        inputDisplay.appendChild(cursorSpan);

        if (caretPos < val.length) {
            const postSpan = document.createElement('span');
            postSpan.textContent = val.substring(caretPos + 1);
            inputDisplay.appendChild(postSpan);
        }

        if (typeof userScrolledUp !== 'undefined' && !userScrolledUp) {
            output.scrollTop = output.scrollHeight;
        }

        if (inputWrapper) {
            inputWrapper.scrollTop = inputWrapper.scrollHeight;
        }
    }

    ['input', 'keydown', 'keyup', 'click', 'focus', 'blur'].forEach(evt => {
        input.addEventListener(evt, () => {
            setTimeout(updateInputDisplay, 0);
        });
    });

    updateInputDisplay();

    output.addEventListener('scroll', () => {
        const distanceFromBottom = output.scrollHeight - output.scrollTop - output.clientHeight;
        if (distanceFromBottom <= 30) {
            userScrolledUp = false;
        } else {
            userScrolledUp = true;
        }
    });

    window.addEventListener('wheel', (e) => {
        if (e.target !== output && !output.contains(e.target)) {
            output.scrollTop += e.deltaY;
        }
        if (e.deltaY < 0) {
            userScrolledUp = true;
        }
    }, { passive: true });

    input.addEventListener('keydown', (e) => {
        audio.init();

        // No procesar input antes de que el juego haya iniciado
        if (!gameStarted) return;

        // Permitir PageUp y PageDown para hacer scroll manual por la terminal
        if (e.key === 'PageUp') {
            output.scrollTop -= output.clientHeight * 0.75;
            userScrolledUp = true;
            e.preventDefault();
            return;
        } else if (e.key === 'PageDown') {
            output.scrollTop += output.clientHeight * 0.75;
            e.preventDefault();
            return;
        }

        if (isTyping) {
            if (e.key === 'Enter') {
                skipCurrent = true;
                userScrolledUp = false;
            }
            // Permitir recargar la página (F5 o Ctrl+R) y pantalla completa (F11 o Esc)
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || e.key === 'F11' || e.key === 'Escape') return;
            e.preventDefault(); // Bloquear cualquier otra tecla durante animaciones
            return;
        }

        const val = input.value;
        const start = input.selectionStart;

        if (e.key === 'Enter') {
            const command = input.value;
            skipCurrent = false;
            userScrolledUp = false;
            output.scrollTop = output.scrollHeight;
            printLine("<br>", "standard", false); // Separator
            printLine('> ' + command, 'standard', false);
            processCommand(command);
            input.value = '';
            setTimeout(updateInputDisplay, 0);
            audio.playKey();
        } else if (e.key === 'Backspace') {
            // Permitir borrar palabras completas con CTRL + Backspace (comportamiento nativo)
            if (e.ctrlKey) return;

            if (input.selectionStart === input.selectionEnd) {
                if (start > 0 || start < val.length) {
                    e.preventDefault();
                    if (start < val.length) {
                        input.value = val.substring(0, start) + val.substring(start + 1);
                        input.setSelectionRange(Math.max(0, start - 1), Math.max(0, start - 1));
                    } else {
                        input.value = val.substring(0, start - 1);
                        input.setSelectionRange(start - 1, start - 1);
                    }
                    updateInputDisplay();
                }
            }
        } else if (e.key === 'Delete') {
            // Permitir CTRL + Supr nativo
            if (e.ctrlKey) return;
        }
    });

    input.addEventListener('input', () => {
        if (isTyping) {
            input.value = ''; // Limpiar cualquier texto que se haya colado
            updateInputDisplay();
            return;
        }
        updateInputDisplay();
        audio.playKey();
    });

    async function printLine(text, type = 'standard', animated = true) {
        return new Promise((resolve) => {
            messageQueue.push({ text, type, animated, resolve });
            if (!isTyping) {
                isTyping = true;
                setTimeout(processQueue, 0);
            }
        });
    }

    async function processQueue() {
        if (messageQueue.length === 0) {
            isTyping = false;
            skipCurrent = false;
            screen.classList.remove('typing-active');
            input.focus();
            return;
        }

        isTyping = true;
        screen.classList.add('typing-active');

        const { text, type, animated, resolve } = messageQueue.shift();
        const line = document.createElement('div');
        line.className = 'line ' + type;
        output.appendChild(line);

        if (!animated || skipCurrent) {
            line.innerHTML = text;
            if (!userScrolledUp || skipCurrent) {
                output.scrollTop = output.scrollHeight;
            }
            resolve();
            processQueue();
            return;
        }

        const contentSpan = document.createElement('span');
        line.appendChild(contentSpan);
        const gameCursor = document.createElement('span');
        gameCursor.className = 'game-cursor';
        line.appendChild(gameCursor);

        let currentText = '';
        let i = 0;

        const typingInterval = setInterval(() => {
            if (i < text.length && !skipCurrent) {
                if (text.substring(i, i + 4) === '<br>') {
                    currentText += '<br>';
                    i += 4;
                } else {
                    currentText += text[i];
                    i++;
                }
                contentSpan.innerHTML = currentText;
                if (!userScrolledUp) {
                    output.scrollTop = output.scrollHeight;
                }
                audio.playKey();
            } else {
                clearInterval(typingInterval);
                if (skipCurrent) contentSpan.innerHTML = text;
                gameCursor.remove();
                if (!userScrolledUp || skipCurrent) {
                    output.scrollTop = output.scrollHeight;
                }
                resolve();
                processQueue();
            }
        }, 30);
    }

    // --- GAME ENGINE (MATRIX ADAPTATION) ---
    const gameState = {
        currentLocation: 'habitacion_101',
        inventory: [],
        flags: {
            door_knocked: false,
            read_message: false,
            has_disk: false,
            met_choi: false
        }
    };

    const rabbitAscii = `                .".
               /  |
              /  /
             / ,"
  .-------.--- /
 "._ __.-/ o. o\\
     "   (    Y )
         )     /
        /       Y
     .-"         |
    /  _     \\    \\
   /    \`. ". ) /' )
  Y       )( / /(,/
 ,|      /     )
 " \\_  (__    (_
     "-._,)--._,)`;

    const world = {
        'habitacion_101': {
            description: "Habitación 101. Tu apartamento parece una celda tecnológica. Montañas de 'HARDWARE' y 'CABLES' brillan en la oscuridad.<br>Tu 'ORDENADOR' principal está activo.<br>Una 'ESTANTERIA' vieja se apoya contra la pared.<br>Al fondo, la 'PUERTA' de salida.",
            items: [],
            interactables: {
                'ordenador': () => {
                    if (!gameState.flags.read_message) {
                        printLine("Te acercas al monitor. El texto verde ya no está... 'Sigue al conejo blanco'.");
                        printLine("De repente, un sonido seco te sobresalta.", "important");
                        printLine("<br>");
                        printLine("¡TOC TOC TOC!", "important");
                        printLine("<br>");
                        printLine("Alguien golpea tu 'PUERTA'.", "important");
                        gameState.flags.door_knocked = true;
                        gameState.flags.read_message = true;
                    } else {
                        printLine("El monitor de fósforo verde muestra un cursor parpadeante sobre fondo negro. La conexión remota se ha cortado.");
                    }
                },
                'estanteria': "Una estantería metálica repleta de manuales sobre UNIX, libros de computación cuántica y filosofía. Un 'LIBRO' destaca entre todos: 'Simulacra & Simulation'.",
                'puerta': () => {
                    if (gameState.flags.door_knocked) {
                        printLine("Alguien está golpeando con insistencia desde el pasillo. Deberías 'ABRIR' la 'PUERTA'.");
                    } else {
                        printLine("La pesada puerta blindada de tu apartamento. Está cerrada con tres cerrojos. No tienes motivos para salir aún.");
                    }
                },
                'libro': () => {
                    printLine("Sacas 'Simulacra & Simulation' de Jean Baudrillard. Lo abres por el capítulo 'Sobre el nihilismo'.");
                    if (!gameState.flags.has_disk) {
                        printLine("Las páginas centrales están recortadas formando un escondite secreto. En su interior descansa un MiniDisc pirata etiquetado como 'DISCO'.");
                        printLine("Añades el 'DISCO' a tu inventario.");
                        gameState.inventory.push('disco');
                        gameState.flags.has_disk = true;
                    } else {
                        printLine("El hueco secreto tallado en las páginas está vacío.");
                    }
                },
                'disco': () => {
                    if (gameState.flags.has_disk) {
                        printLine("Un MiniDisc óptico de alta densidad con el rótulo manuscrito 'DISK 067'. Contiene el software ilegal encriptado que Choi te encargó.");
                    } else {
                        printLine("No ves ningún disco a simple vista. Debe de estar oculto en algún lugar seguro del apartamento.");
                    }
                },
                'hardware': "Torres abiertas, placas de circuitos integrados y procesadores desoldados se amontonan sobre la mesa de trabajo.",
                'cables': "Una maraña de cables de alimentación, fibra óptica y líneas coaxiales que recorren el suelo como serpientes negras."
            }
        },
        'pasillo': {
            description: "El pasillo del edificio es lúgubre y huele a humedad. 'CHOI' y su chica, 'DUJOUR', están esperando junto al 'ASCENSOR'.",
            exits: { 'ascensor': 'calle' },
            interactables: {
                'ascensor': "El viejo ascensor del edificio con rejas de hierro forjado. La cabina cuelga de gruesos cables en el hueco oscuro. Puedes 'ABRIR' o 'IR' al 'ASCENSOR' para bajar a la calle.",
                'choi': "- CHOI: Vamos Neo, date prisa tío, el club nos espera. Esta noche necesitas desconectar de tantas pantallas.",
                'dujour': "Dujour te observa fijamente con una sonrisa enigmática. Lleva una cazadora negra de vinilo y en su hombro descubierto resalta el tatuaje de un 'CONEJO' blanco.",
                'conejo': () => {
                    printLine("Un pequeño tatuaje de un conejo blanco en la piel pálida de Dujour. Un escalofrío te sacude al recordarlo... 'Sigue al conejo blanco'.");
                    printLine(rabbitAscii);
                },
                'tatuaje': () => {
                    printLine("Un pequeño tatuaje de un conejo blanco en la piel pálida de Dujour. Un escalofrío te sacude al recordarlo... 'Sigue al conejo blanco'.");
                    printLine(rabbitAscii);
                }
            }
        },
        'calle': {
            description: "Tras bajar en ascensor, ves la ciudad gótica bajo la 'LLUVIA'. Luces de 'NEON' se reflejan en los 'CHARCOS'. Al final de la calle ves el cartel del 'CLUB': 'The End'.",
            exits: { 'club': 'club' },
            interactables: {
                'club': "Un club subterráneo de ambiente industrial llamado 'The End'. Por las puertas entreabiertas escapan densas columnas de humo y un bajo atronador de música electrónica.",
                'lluvia': "Una lluvia fina pero helada cae sobre el asfalto gastado, distorsionando las luces de la metrópolis.",
                'neon': "Un cartel de neón gastado zumba sobre tu cabeza reflejando tonos fríos en las fachadas de ladrillo húmedo.",
                'charcos': "Los charcos oscuros en el suelo reflejan los destellos verdes y violetas de los carteles luminosos."
            }
        },
        'club': {
            description: "La 'MUSICA' industrial golpea tu pecho. Esta sonando Dragula de Rob Zombie. 'HUMO', cuero y oscuridad. En una esquina, una figura te observa. Es 'ELLA'.",
            interactables: {
                'ella': () => {
                    printLine("Una mujer de vinilo negro te observa con calma absoluta desde una esquina en penumbra. Sus ojos parecen ver a través de ti.");
                    startDialog('trinity_encounter');
                },
                'trinity': () => {
                    printLine("Una mujer de vinilo negro te observa con calma absoluta desde una esquina en penumbra. Sus ojos parecen ver a través de ti.");
                    startDialog('trinity_encounter');
                },
                'musica': "El bajo implacable de Rob Zombie hace vibrar el suelo de hormigón y retumba directamente en tu pecho.",
                'humo': "Nubes de humo dulce y niebla artificial flotan entre los focos estroboscópicos."
            }
        }
    };

    const dialogs = {
        'choi_encounter': [
            "- NEO: Llegas con retraso.",
            "- CHOI: Lo sé. La culpa es de ella. (mira a su novia Dujour)",
            "- NEO: ¿Tienes el dinero?",
            "- CHOI: agh... Dos mil.",
            "- NEO: Espera.",
            "<br>",
            "(Le entregas el 'DISCO 067'. Choi sonríe al ver la mercancía.)",
            "<br>",
            "- CHOI: Aleluya, me has salvado tío. Eres mi Jesucristo particular.",
            "- NEO: Como te pillen utilizando eso!!!",
            "- CHOI: Tranquilo, nunca ha pasado. Tú no existes.",
            "- NEO: exacto.",
            "- CHOI: ¿Te ocurre algo? Estás más pálido de lo normal.",
            "- NEO: Mi ordenador está... ¿Alguna vez has tenido la sensación de no saber con seguridad si sueñas o estás despierto?",
            "- CHOI: Sí, alguna vez... gracias a la mescalina. Es una buena forma de volar.",
            "<br>",
            "(DUJOUR te mira con curiosidad. Lleva un tatuaje en el hombro: un conejo blanco...)",
            "<br>",
            rabbitAscii,
            "<br>",
            "- DUJOUR: ¿Nos lo llevamos?",
            "- CHOI: Claro. Ven con nosotros, Neo. Tienes que desconectar.",
            "<br>",
            "(Decides seguirlos. 'Sigue al conejo blanco'...)"
        ],

        'trinity_encounter': [
            "(La mujer se acerca a ti. Sus ojos azules brillan en la oscuridad.)",
            "<br>",
            "- TRINITY: Hola, Neo.",
            "- NEO: ¿Cómo sabes mi nombre?",
            "- TRINITY: Sé mucho sobre ti.",
            "- NEO: ¿Quién eres?",
            "- TRINITY: Me llamo Trinity.",
            "- NEO: ¿Trinity? ¿La que pirateó la base de datos de Hacienda?",
            "- TRINITY: Eso fue hace tiempo.",
            "- TRINITY: Sé por qué estás aquí, Neo. Sé lo que estás haciendo. Sé por qué apenas duermes.",
            "- TRINITY: Le buscas a él. Lo sé porque una vez yo estuve buscando lo mismo.",
            "- TRINITY: Y cuando él me encontró, me dijo que en realidad no le buscaba a él. Lo que buscaba era una respuesta.",
            "- TRINITY: Es la pregunta la que te ha traído aquí. Conoces la pregunta igual que yo.",
            "- NEO: ¿Qué es Matrix?",
            "- TRINITY: La respuesta la encontrarás por ahí. Te está buscando... y te encontrará, siempre que lo desee.",
            "<br>",
            "(Trinity se acerca a tu oído y susurra)",
            "<br>",
            "- TRINITY: Despierta, Neo."
        ]
    };

    async function startDialog(dialogId) {
        isTyping = true;
        screen.classList.add('typing-active');
        const lines = dialogs[dialogId];

        // Encolar todas las líneas a la vez para que el "skip" (Enter) funcione en todo el bloque
        const promises = lines.map(line => printLine(line, 'dialog'));
        await Promise.all(promises);

        // Efectos post-diálogo
        if (dialogId === 'choi_encounter') {
            gameState.currentLocation = 'pasillo'; // Transición lógica

            // Entregas el disco, así que lo quitamos del inventario
            gameState.inventory = gameState.inventory.filter(item => item !== 'disco');

            setTimeout(() => {
                printLine("<br>Sales al pasillo. 'CHOI' y 'DUJOUR' te esperan junto al 'ASCENSOR'.", 'info');
                gameState.flags.met_choi = true;
            }, 500);
        } else if (dialogId === 'trinity_encounter') {
            setTimeout(startMatrixEffect, 2000);
        }
    }

    function startMatrixEffect(isScreensaver = false) {
        // 1. Desvanecer texto actual
        const inputLine = document.querySelector('.input-line');
        output.style.transition = 'opacity 2s ease-in-out';
        inputLine.style.transition = 'opacity 2s ease-in-out';
        output.style.opacity = '0';
        inputLine.style.opacity = '0';

        // 2. Esperar a que termine el desvanecimiento para iniciar el efecto
        setTimeout(() => {
            if (isScreensaver) {
                // Solo ocultar para poder restaurar
                output.style.display = 'none';
                inputLine.style.display = 'none';
            } else {
                // Limpiar pantalla y cambiar display (modo fin de juego)
                output.innerHTML = '';
                inputLine.style.display = 'none';
            }

            // Restaurar opacidad (para cuando se vuelva a mostrar o para el canvas si afectase)
            output.style.opacity = '1';
            inputLine.style.opacity = '1';

            // Crear canvas
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '5'; // Debajo de scanlines (z-10)
            screen.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            canvas.width = screen.offsetWidth;
            canvas.height = screen.offsetHeight;

            const katakana = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
            const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            const nums = '01';
            const alphabet = katakana + latin + nums;

            const fontSize = 16;
            const columns = canvas.width / fontSize;
            const drops = [];

            for (let x = 0; x < columns; x++) {
                drops[x] = 1;
            }

            function draw() {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = '#b3ffb3';
                ctx.font = fontSize + 'px monospace';

                for (let i = 0; i < drops.length; i++) {
                    const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
                    ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                        drops[i] = 0;
                    }
                    drops[i]++;
                }
            }

            const intervalId = setInterval(draw, 30);
            audio.startMatrixAudio();

            // Si es modo salvapantallas, permitir salir con Enter
            if (isScreensaver) {
                const stopMatrix = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        clearInterval(intervalId);
                        audio.stopMatrixAudio();
                        canvas.remove();

                        // Restaurar vista
                        output.style.display = ''; // Eliminar inline style para volver a CSS original
                        inputLine.style.display = '';

                        window.removeEventListener('keydown', stopMatrix);
                        document.getElementById('command-input').focus();
                    }
                };
                window.addEventListener('keydown', stopMatrix);
            }

        }, 2000);
    }

    const commands = {
        'conejo': () => { printLine(rabbitAscii); },
        'cmatrix': () => { startMatrixEffect(true); },
        'matrix': () => { startMatrixEffect(true); },
        'ayuda': () => {
            printLine("COMANDOS DISPONIBLES:");
            printLine("- MIRAR [OBJETO]: Observa algo del entorno.");
            printLine("- COGER [OBJETO]: Recoge un objeto.");
            printLine("- ABRIR [OBJETO]: Abre puertas, libros o accesos.");
            printLine("- IR [LUGAR]: Muévete a un lugar o acceso.");
            printLine("- INVENTARIO: Mira lo que llevas.");
            printLine("- LIMPIAR: Limpia la terminal.");
            printLine("<br>", "standard", false);
        },
        'limpiar': () => { output.innerHTML = ''; userScrolledUp = false; },
        'inventario': () => {
            if (gameState.inventory.length === 0) printLine("Bolsillos vacíos.");
            else printLine("Inventario: " + gameState.inventory.join(', '));
            printLine("<br>", "standard", false);
        },
        'mirar': (args) => {
            const room = world[gameState.currentLocation];
            const target = cleanTarget(args);

            if (!target) {
                printLine(room.description, 'info');
                if (room.items && room.items.length > 0) printLine("Ves: " + room.items.join(', '));
                printLine("<br>", "standard", false);
                return;
            }

            // Alias comunes de sala
            if (target === 'alrededor' || target === 'habitacion' || target === 'sala' || target === 'pasillo' || target === 'calle' || target === 'club') {
                printLine(room.description, 'info');
                return;
            }

            // Mirar objetos específicos exactos
            if (room.interactables && room.interactables[target]) {
                const interaction = room.interactables[target];
                if (typeof interaction === 'function') interaction();
                else printLine(interaction);
                return;
            }

            // Búsqueda por coincidencia parcial en interactables
            if (room.interactables) {
                for (const key of Object.keys(room.interactables)) {
                    if (target.includes(key) || key.includes(target)) {
                        const interaction = room.interactables[key];
                        if (typeof interaction === 'function') interaction();
                        else printLine(interaction);
                        return;
                    }
                }
            }

            printLine("No ves nada especial en eso.");
        },
        'coger': (args) => {
            const target = cleanTarget(args);
            if (!target) {
                printLine("¿Qué quieres coger?");
                return;
            }

            if (gameState.currentLocation === 'habitacion_101') {
                if (target === 'disco') {
                    if (gameState.flags.has_disk) {
                        printLine("Ya tienes el 'DISCO' en tu inventario.");
                    } else {
                        printLine("No ves ningún disco a simple vista. Quizás esté escondido.");
                    }
                    return;
                }
                if (target === 'libro' || target === 'simulacra') {
                    world['habitacion_101'].interactables['libro']();
                    return;
                }
                if (target === 'ordenador') {
                    printLine("Pesa demasiado y está conectado a una maraña de cables.");
                    return;
                }
                if (target === 'estanteria') {
                    printLine("No puedes llevarte un mueble entero.");
                    return;
                }
                if (target === 'puerta') {
                    printLine("La puerta está sólidamente anclada al marco.");
                    return;
                }
                if (target === 'hardware') {
                    printLine("Las placas base y procesadores están calientes por el funcionamiento.");
                    return;
                }
                if (target === 'cables') {
                    printLine("Están enredados alimentando los equipos; mejor no desconectarlos.");
                    return;
                }
            }

            if (gameState.currentLocation === 'pasillo') {
                if (target === 'ascensor') {
                    printLine("No puedes coger un ascensor. Prueba a 'ABRIR' o 'IR' al 'ASCENSOR'.");
                    return;
                }
                if (target === 'choi') {
                    printLine("Choi se ríe y te da un codazo amistoso: 'Guarda esa energía para el club, colega'.");
                    return;
                }
                if (target === 'dujour') {
                    printLine("Dujour te aparta con una sonrisa pícara: 'Despacio, vaquero... guárdate para el club'.");
                    return;
                }
                if (target === 'conejo' || target === 'tatuaje') {
                    printLine("Es un tatuaje en la piel de Dujour, no puedes cogerlo.");
                    return;
                }
            }

            if (gameState.currentLocation === 'calle') {
                if (target === 'club') {
                    printLine("No puedes coger un edificio entero.");
                    return;
                }
                if (target === 'lluvia') {
                    printLine("El agua resbala entre tus dedos.");
                    return;
                }
                if (target === 'neon') {
                    printLine("El cartel de neón cuelga en lo alto, fuera de tu alcance.");
                    return;
                }
                if (target === 'charcos') {
                    printLine("Solo te mojarías las manos de agua sucia.");
                    return;
                }
            }

            if (gameState.currentLocation === 'club') {
                if (target === 'ella' || target === 'trinity') {
                    printLine("Te acercas con cautela a ella en la penumbra...");
                    startDialog('trinity_encounter');
                    return;
                }
                if (target === 'musica') {
                    printLine("No puedes coger la música, solo sentirla en el pecho.");
                    return;
                }
                if (target === 'humo') {
                    printLine("El humo se disipa entre tus dedos.");
                    return;
                }
            }

            printLine("No puedes coger eso.");
        },
        'abrir': (args) => {
            const target = cleanTarget(args);
            if (!target) {
                printLine("¿Qué quieres abrir?");
                return;
            }

            if (gameState.currentLocation === 'habitacion_101') {
                if (target === 'puerta') {
                    if (gameState.flags.door_knocked) {
                        if (gameState.flags.has_disk) {
                            printLine("Abres la puerta. 'CHOI', 'DUJOUR' y tres personas más están allí.");
                            startDialog('choi_encounter');
                        } else {
                            printLine("Abres la puerta ligeramente sujeta por la cadena de seguridad.", "info");
                            printLine("- CHOI: ¡Eh, colega! ¿Tienes lo mío?", "dialog");
                            printLine("- NEO: Claro, espera un segundo.", "dialog");
                            printLine("Cierras la puerta. Necesitas el 'DISCO' antes de salir.", "info");
                        }
                    } else {
                        printLine("No tienes motivos para salir aún. Deberías revisar tu 'ORDENADOR'.");
                    }
                    return;
                }
                if (target === 'libro' || target === 'simulacra') {
                    world['habitacion_101'].interactables['libro']();
                    return;
                }
                if (target === 'ordenador') {
                    printLine("La torre ya tiene el panel lateral retirado; los ventiladores zumban a toda velocidad.");
                    return;
                }
                if (target === 'estanteria') {
                    printLine("Es una estantería abierta de madera, no tiene puertas.");
                    return;
                }
                if (target === 'disco') {
                    printLine("El MiniDisc está sellado en su estuche. Si lo abres, destruirás los datos magnéticos.");
                    return;
                }
                if (target === 'hardware') {
                    printLine("Las torres ya están completamente desarmadas.");
                    return;
                }
                if (target === 'cables') {
                    printLine("No se pueden abrir cables.");
                    return;
                }
            }

            if (gameState.currentLocation === 'pasillo') {
                if (target === 'ascensor') {
                    printLine("Abres las puertas metálicas del ascensor y entras con Choi y Dujour.");
                    handleMovement('ascensor');
                    return;
                }
                if (target === 'puerta') {
                    printLine("La puerta de tu apartamento ya está cerrada detrás de ti.");
                    return;
                }
                if (target === 'choi' || target === 'dujour') {
                    printLine("No tiene sentido abrir a una persona.");
                    return;
                }
            }

            if (gameState.currentLocation === 'calle') {
                if (target === 'club') {
                    printLine("Empujas la pesada puerta acústica del club y entras con el grupo.");
                    handleMovement('club');
                    return;
                }
            }

            printLine("No se puede abrir.");
        },
        'ir': (args) => {
            const target = cleanTarget(args);
            if (!target) {
                printLine("¿Adónde quieres ir?");
                return;
            }

            if (gameState.currentLocation === 'habitacion_101') {
                if (target === 'puerta') {
                    if (gameState.flags.door_knocked) {
                        if (gameState.flags.has_disk) {
                            printLine("Vas hacia la puerta y la abres. 'CHOI', 'DUJOUR' y tres personas más están allí.");
                            startDialog('choi_encounter');
                        } else {
                            printLine("Te acercas a la puerta y la abres ligeramente.", "info");
                            printLine("- CHOI: ¡Eh, colega! ¿Tienes lo mío?", "dialog");
                            printLine("- NEO: Claro, espera un segundo.", "dialog");
                            printLine("Cierras la puerta. Necesitas el 'DISCO' antes de salir.", "info");
                        }
                    } else {
                        printLine("Te acercas a la puerta, pero está cerrada. No tienes motivos para salir aún.");
                    }
                    return;
                }
                if (target === 'ordenador') {
                    world['habitacion_101'].interactables['ordenador']();
                    return;
                }
                if (target === 'estanteria') {
                    printLine("Te acercas a la estantería de libros técnicos y filosofía.");
                    return;
                }
                if (target === 'libro') {
                    world['habitacion_101'].interactables['libro']();
                    return;
                }
                if (target === 'hardware' || target === 'cables') {
                    printLine("Te agachas junto a los montones de hardware y cables.");
                    return;
                }
            }

            if (gameState.currentLocation === 'pasillo') {
                if (target === 'ascensor') {
                    printLine("Entras al ascensor con Choi y Dujour.");
                    handleMovement('ascensor');
                    return;
                }
                if (target === 'choi') {
                    printLine("Ya estás al lado de Choi en el pasillo.");
                    return;
                }
                if (target === 'dujour') {
                    printLine("Te aproximas a Dujour. Su perfume y su mirada te envuelven.");
                    return;
                }
                if (target === 'conejo') {
                    printLine("Miras de cerca el tatuaje en el hombro de Dujour.");
                    return;
                }
            }

            if (gameState.currentLocation === 'calle') {
                if (target === 'club') {
                    printLine("Caminas bajo la lluvia hacia la entrada del club...");
                    handleMovement('club');
                    return;
                }
            }

            if (gameState.currentLocation === 'club') {
                if (target === 'ella' || target === 'trinity') {
                    printLine("Te abres paso entre la multitud hasta llegar a su rincón...");
                    startDialog('trinity_encounter');
                    return;
                }
            }

            handleMovement(target);
        }
    };

    function cleanTarget(args) {
        if (!args || args.length === 0) return '';
        let t = args.join(' ').toLowerCase().trim();
        t = t.replace(/^[«<"']+|[»>"'.,;!?]+$/g, '').trim();
        return t;
    }

    function processCommand(rawInput) {
        let cleanInput = rawInput.trim().toLowerCase();
        cleanInput = cleanInput.replace(/^[«<"']+|[»>"'.,;!?]+$/g, '').trim();
        if (cleanInput === '') return;

        // Easter egg / comando directo: conejo o conejo blanco
        if (cleanInput === 'conejo' || cleanInput === 'conejo blanco') {
            printLine(rabbitAscii);
            return;
        }

        const parts = cleanInput.split(/\s+/);
        const mainCommand = parts[0];
        const args = parts.slice(1);

        if (commands[mainCommand]) {
            if (args.length > 0) {
                const firstArg = args[0].toLowerCase();
                const forbiddenArticles = ['el', 'la', 'los', 'las', 'al', 'del', 'a'];
                if (forbiddenArticles.includes(firstArg)) {
                    printLine("No uses artículos ni preposiciones ('el', 'al', 'la'...). Escribe solo el verbo y el objeto (ej: " + mainCommand.toUpperCase() + " " + args.slice(1).join(' ').toUpperCase() + ").");
                    return;
                }
            }
            commands[mainCommand](args);
            return;
        }

        printLine("Comando no reconocido. Prueba 'AYUDA'.");
        printLine("<br>", "standard", false);
    }

    function handleMovement(rawDirection) {
        if (!rawDirection) {
            printLine("¿Adónde quieres ir?");
            return;
        }

        const direction = cleanTarget([rawDirection]);

        const room = world[gameState.currentLocation];
        if (room.exits) {
            for (const [exitKey, exitRoom] of Object.entries(room.exits)) {
                if (direction === exitKey) {
                    gameState.currentLocation = exitRoom;
                    printLine(`...`, 'info');
                    setTimeout(() => commands['mirar']([]), 300);
                    return;
                }
            }
        }
        printLine("No puedes ir por ahí.");
    }

    async function startIntro() {
        // Pausa inicial de 2 segundos con cursor parpadeante
        isTyping = true;
        screen.classList.add('typing-active');
        const waitLine = document.createElement('div');
        waitLine.className = 'line standard';
        const waitCursor = document.createElement('span');
        waitCursor.className = 'game-cursor blink'; // Clase blink para que parpadee durante la espera
        waitLine.appendChild(waitCursor);
        output.appendChild(waitLine);

        // Helper para esperar y limpiar pantalla
        const waitAndClear = async (ms) => {
            isTyping = true; // Bloquear input y permitir Enter para saltar
            await new Promise(resolve => {
                const start = Date.now();
                const interval = setInterval(() => {
                    if (skipCurrent || (Date.now() - start >= ms)) {
                        clearInterval(interval);
                        skipCurrent = false;
                        resolve();
                    }
                }, 50);
            });
            output.innerHTML = '';
            userScrolledUp = false;
            isTyping = false; // Permitir que la siguiente línea arranque
        };

        // Espera inicial de carga
        await new Promise(resolve => {
            const startTime = Date.now();
            const check = setInterval(() => {
                if (skipCurrent || (Date.now() - startTime >= 2000)) {
                    clearInterval(check);
                    resolve();
                }
            }, 50);
        });

        waitLine.remove();
        // Limpiamos cualquier rastro previo
        output.innerHTML = '';
        userScrolledUp = false;
        isTyping = false;

        // --- SECUENCIA DE INTRO ---

        // 1. Bloque inicial (2 líneas)
        const now = new Date();
        const timeStr = [
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0')
        ].join(':');
        await printLine(`Call trans opt: received. 2-19-1998 ${timeStr} REC:Log>`, "intro-text");
        await printLine("Trace program: running", "intro-text");
        await waitAndClear(2500);

        // 2. Líneas individuales
        await printLine("Despierta, Neo...", "intro-text");
        await waitAndClear(1500);

        await printLine("La Matrix te tiene...", "intro-text");
        await waitAndClear(1500);

        await printLine("Sigue al conejo blanco.", "intro-text");
        await waitAndClear(2000);

        await printLine("Knok, Knok, Neo.", "intro-text");
        await waitAndClear(1500);

        // Mensaje final (no se borra)
        await printLine("Escribe 'AYUDA' si quieres los comandos o 'MIRAR' si quieres empezar.", "intro-text");

        // Fin de la intro: permitir input del jugador
        screen.classList.remove('intro-hide');
    }

    // Cursor inicial de espera (antes del clic)
    const initialWaitLine = document.createElement('div');
    initialWaitLine.className = 'line standard';
    const initialWaitCursor = document.createElement('span');
    initialWaitCursor.className = 'game-cursor blink';
    initialWaitLine.appendChild(initialWaitCursor);
    output.appendChild(initialWaitLine);

    // Iniciar juego al hacer clic o pulsar tecla
    function initGame(e) {
        if (gameStarted) return;

        // Ignorar teclas de función (F1-F12) y Escape
        if (e && e.type === 'keydown' && (/^F\d+$/.test(e.key) || e.key === 'Escape')) return;

        gameStarted = true;

        audio.init();
        if (initialWaitLine.parentNode) initialWaitLine.remove();
        startIntro();
    }

    screen.addEventListener('click', initGame);
    window.addEventListener('keydown', initGame);
});
