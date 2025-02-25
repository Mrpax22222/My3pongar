import * as THREE from 'three';

export class PongGame {
    constructor(arScene, debug) {
        this.arScene = arScene;
        this.debug = debug;
        
        // Game objects
        this.table = null;
        this.ball = null;
        this.playerPaddle = null;
        this.aiPaddle = null;
        this.walls = [];
        this.particles = [];
        this.scoreIndicators = [];
        
        // Game state
        this.isPlaying = false;
        this.playerScore = 0;
        this.aiScore = 0;
        this.ballVelocity = new THREE.Vector3(0, 0, 0);
        this.ballSpeed = 0.5;
        this.lastPosition = new THREE.Vector3();
        this.gameStartTime = 0;
        this.gameLevel = 1;
        this.winningScore = 5;
        
        // Game dimensions for 3D
        this.tableWidth = 0.8;
        this.tableDepth = 1.2;
        this.tableHeight = 0.01; 
        this.playAreaHeight = 0.6; 
        this.wallHeight = this.playAreaHeight; 
        this.paddleWidth = 0.15;
        this.paddleHeight = 0.15; 
        this.paddleDepth = 0.01;
        this.ballRadius = 0.02;
        
        // Add gravity effect
        this.gravity = -0.3; 
        this.groundDamping = 0.8; 
        
        // Touch/pointer interaction
        this.pointerDown = false;
        this.pointerPosition = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.localTouchPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.tableHeight + this.paddleHeight / 2));
        
        // Add vertical movement range for paddles
        this.paddleMinHeight = this.tableHeight + this.paddleHeight / 2;
        this.paddleMaxHeight = this.tableHeight + this.playAreaHeight - this.paddleHeight / 2;

        // DOM Elements
        this.playerScoreElement = document.getElementById('playerScore');
        this.aiScoreElement = document.getElementById('aiScore');
        
        // Effects
        this.particlePool = [];
        this.particleCount = 50;
        this.trailUpdateCounter = 0;
        
        // Sound effects
        this.audioContext = null;
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            if (window.AudioContext) {
                this.audioContext = new AudioContext();
            }
        } catch (e) {
            this.debug.warn("Web Audio API not supported:", e);
        }
        
        // Enhanced 3D movement parameters
        this.paddleVerticalRange = this.playAreaHeight - this.paddleHeight;
        this.paddleDepthRange = this.tableDepth * 0.4; // 40% of table depth for movement
        this.aiPaddleMovementSpeed = 0.5;
        
        // Touch/pointer interaction for 3D
        this.lastPointerPosition = new THREE.Vector2();
        this.pointerDelta = new THREE.Vector2();
        this.verticalSensitivity = 1.0;
        this.depthSensitivity = 0.5;
        
        this.debug.log("PongGame constructor initialized");
    }
    
    initialize() {
        this.debug.log("Initializing PongGame");
        
        // Create the game environment
        this.createTable();
        this.createBall();
        this.createPaddles();
        this.createWalls();
        this.createParticlePool();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Add update callback
        this.arScene.addUpdateCallback(this.update.bind(this));
        
        // Start the game
        this.resetBall(true);
        this.isPlaying = true;
        this.gameStartTime = Date.now();
        
        // Reset scores
        this.playerScore = 0;
        this.aiScore = 0;
        this.updateScoreDisplay();
        
        this.debug.log("PongGame initialized successfully");
    }
    
    createTable() {
        this.debug.log("Creating game table");
        
        // Create a semi-transparent table at specified height
        this.table = this.arScene.createHorizontalPlane(
            this.tableWidth, 
            this.tableDepth, 
            0x1a75ff, 
            this.tableHeight
        );
        
        // Add grid lines to the table for better depth perception
        const gridHelper = new THREE.GridHelper(this.tableWidth, 10, 0xffffff, 0xffffff);
        gridHelper.rotation.x = Math.PI / 2;
        gridHelper.position.y = 0.001; // Just above the table
        gridHelper.material.opacity = 0.2;
        gridHelper.material.transparent = true;
        this.table.add(gridHelper);
        
        // Add a visual boundary to the table
        const tableBoundaryGeometry = new THREE.EdgesGeometry(
            new THREE.BoxGeometry(this.tableWidth, 0.01, this.tableDepth)
        );
        const tableBoundaryMaterial = new THREE.LineBasicMaterial({ 
            color: 0x00ffff,
            linewidth: 2 // Note: linewidth may not work in all browsers/GPUs
        });
        const tableBoundary = new THREE.LineSegments(tableBoundaryGeometry, tableBoundaryMaterial);
        this.table.add(tableBoundary);
        
        // Add center line
        const centerLineGeometry = new THREE.BoxGeometry(this.tableWidth, 0.001, 0.005);
        const centerLineMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0.7
        });
        const centerLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
        centerLine.position.set(0, 0.001, 0);
        this.table.add(centerLine);
        
        // Add a center circle
        const circleGeometry = new THREE.RingGeometry(0.1, 0.102, 32);
        const circleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const centerCircle = new THREE.Mesh(circleGeometry, circleMaterial);
        centerCircle.rotation.x = -Math.PI / 2;
        centerCircle.position.y = 0.001;
        this.table.add(centerCircle);
        
        // Add a soft glow to the table edges
        const glowGeometry = new THREE.BoxGeometry(this.tableWidth * 1.02, 0.01, this.tableDepth * 1.02);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        const tableGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        tableGlow.position.y = -0.005;
        this.table.add(tableGlow);
    }
    
    createBall() {
        this.debug.log("Creating game ball");
        
        // Create a spherical ball
        const ballGeometry = new THREE.SphereGeometry(this.ballRadius, 16, 16);
        const ballMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            emissive: 0x444444,
            shininess: 100
        });
        
        this.ball = new THREE.Mesh(ballGeometry, ballMaterial);
        this.ball.position.y = this.tableHeight + this.ballRadius; // Position just above the table
        this.ball.castShadow = true;
        
        // Add glow effect
        const glowGeometry = new THREE.SphereGeometry(this.ballRadius * 1.2, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.ball.add(glow);
        
        // Add a trail effect
        const trail = this.createTrailEffect();
        this.ball.add(trail);
        
        this.arScene.addObject(this.ball);
    }
    
    createTrailEffect() {
        // Create a particle system for the trail effect
        const particleCount = 50;
        const particles = new THREE.BufferGeometry();
        
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        // Initialize positions and colors
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = -i * 0.01; // Trail behind the ball
            
            // Fade out color
            const alpha = 1 - (i / particleCount);
            colors[i * 3] = 0; // R
            colors[i * 3 + 1] = 1 * alpha; // G
            colors[i * 3 + 2] = 1 * alpha; // B
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.01,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        
        return new THREE.Points(particles, particleMaterial);
    }
    
    createParticlePool() {
        // Create a pool of particle systems for effects
        for (let i = 0; i < 10; i++) {
            const particleSystem = this.createParticleSystem();
            this.particlePool.push(particleSystem);
            particleSystem.visible = false;
            this.arScene.addObject(particleSystem);
        }
    }
    
    createParticleSystem(count = 30) {
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
            
            colors[i * 3] = Math.random(); // R
            colors[i * 3 + 1] = Math.random(); // G
            colors[i * 3 + 2] = Math.random(); // B
            
            sizes[i] = 0.01 + Math.random() * 0.02;
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.PointsMaterial({
            size: 0.02,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        
        const particleSystem = new THREE.Points(particles, material);
        particleSystem.userData = {
            velocities: new Float32Array(count * 3),
            active: false,
            lifetime: 0,
            maxLifetime: 1.0
        };
        
        return particleSystem;
    }
    
    emitParticles(position, color, count = 30, speed = 0.1) {
        // Find an available particle system from the pool
        let particleSystem = null;
        for (const ps of this.particlePool) {
            if (!ps.userData.active) {
                particleSystem = ps;
                break;
            }
        }
        
        // If no available system, return
        if (!particleSystem) return;
        
        // Setup particle system
        particleSystem.position.copy(position);
        particleSystem.visible = true;
        
        const positions = particleSystem.geometry.attributes.position.array;
        const colors = particleSystem.geometry.attributes.color.array;
        const velocities = particleSystem.userData.velocities;
        
        // Set color for all particles
        for (let i = 0; i < count; i++) {
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            
            // Initial positions (at center)
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
            
            // Random velocities in a sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const r = Math.random() * speed;
            
            velocities[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            velocities[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            velocities[i * 3 + 2] = r * Math.cos(phi);
        }
        
        particleSystem.geometry.attributes.position.needsUpdate = true;
        particleSystem.geometry.attributes.color.needsUpdate = true;
        
        // Activate the particle system
        particleSystem.userData.active = true;
        particleSystem.userData.lifetime = 0;
        
        // Store in active particles array
        this.particles.push(particleSystem);
    }
    
    updateParticles(deltaTime) {
        for (let i = 0; i < this.particles.length; i++) {
            const ps = this.particles[i];
            
            // Update lifetime
            ps.userData.lifetime += deltaTime;
            
            // If expired, deactivate
            if (ps.userData.lifetime >= ps.userData.maxLifetime) {
                ps.userData.active = false;
                ps.visible = false;
                this.particles.splice(i, 1);
                i--;
                continue;
            }
            
            // Update particle positions based on velocities
            const positions = ps.geometry.attributes.position.array;
            const velocities = ps.userData.velocities;
            const colors = ps.geometry.attributes.color.array;
            const lifePercent = ps.userData.lifetime / ps.userData.maxLifetime;
            
            for (let j = 0; j < positions.length / 3; j++) {
                // Update position
                positions[j * 3] += velocities[j * 3] * deltaTime;
                positions[j * 3 + 1] += velocities[j * 3 + 1] * deltaTime;
                positions[j * 3 + 2] += velocities[j * 3 + 2] * deltaTime;
                
                // Add gravity
                velocities[j * 3 + 1] -= 0.01 * deltaTime;
                
                // Fade out
                const alpha = 1 - lifePercent;
                for (let k = 0; k < 3; k++) {
                    colors[j * 3 + k] *= alpha;
                }
            }
            
            ps.geometry.attributes.position.needsUpdate = true;
            ps.geometry.attributes.color.needsUpdate = true;
        }
    }
    
    updateTrail() {
        // Only update trail every few frames for performance
        this.trailUpdateCounter++;
        if (this.trailUpdateCounter % 2 !== 0) return;
        
        if (this.ball) {
            const trail = this.ball.children.find(child => child instanceof THREE.Points);
            if (trail) {
                const positions = trail.geometry.attributes.position.array;
                
                // Shift all positions forward
                for (let i = positions.length / 3 - 1; i > 0; i--) {
                    positions[i * 3] = positions[(i - 1) * 3];
                    positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
                    positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
                }
                
                // Set first position to current ball position (in local space)
                positions[0] = 0;
                positions[1] = 0;
                positions[2] = 0;
                
                trail.geometry.attributes.position.needsUpdate = true;
            }
        }
    }
    
    createPaddles() {
        this.debug.log("Creating game paddles");
        
        // Create player paddle with 3D movement
        const paddleGeometry = new THREE.BoxGeometry(this.paddleWidth, this.paddleHeight, this.paddleDepth);
        const playerMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.8,
            shininess: 80
        });
        
        this.playerPaddle = new THREE.Mesh(paddleGeometry, playerMaterial);
        this.playerPaddle.position.set(0, this.tableHeight + this.paddleHeight / 2, this.tableDepth / 2 - 0.05);
        this.playerPaddle.castShadow = true;
        
        // Add glow to player paddle
        const playerGlowGeometry = new THREE.BoxGeometry(
            this.paddleWidth * 1.1, 
            this.paddleHeight * 1.1, 
            this.paddleDepth * 1.1
        );
        const playerGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.2,
            side: THREE.BackSide
        });
        const playerGlow = new THREE.Mesh(playerGlowGeometry, playerGlowMaterial);
        this.playerPaddle.add(playerGlow);
        
        // Add lights to player paddle for dramatic effect
        const playerPointLight = new THREE.PointLight(0x00ff88, 0.5, 0.3);
        playerPointLight.position.set(0, 0, 0);
        this.playerPaddle.add(playerPointLight);
        
        this.arScene.addObject(this.playerPaddle);
        
        // Create AI paddle
        const aiMaterial = new THREE.MeshPhongMaterial({
            color: 0xff3366,
            transparent: true,
            opacity: 0.8,
            shininess: 80
        });
        
        this.aiPaddle = new THREE.Mesh(paddleGeometry, aiMaterial);
        this.aiPaddle.position.set(0, this.tableHeight + this.paddleHeight / 2, -this.tableDepth / 2 + 0.05);
        this.aiPaddle.castShadow = true;
        
        // Add glow to AI paddle
        const aiGlowGeometry = new THREE.BoxGeometry(
            this.paddleWidth * 1.1, 
            this.paddleHeight * 1.1, 
            this.paddleDepth * 1.1
        );
        const aiGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff3366,
            transparent: true,
            opacity: 0.2,
            side: THREE.BackSide
        });
        const aiGlow = new THREE.Mesh(aiGlowGeometry, aiGlowMaterial);
        this.aiPaddle.add(aiGlow);
        
        // Add lights to AI paddle
        const aiPointLight = new THREE.PointLight(0xff3366, 0.5, 0.3);
        aiPointLight.position.set(0, 0, 0);
        this.aiPaddle.add(aiPointLight);
        
        this.arScene.addObject(this.aiPaddle);
        
        // Add vertical movement properties
        this.playerPaddle.userData.verticalPosition = 0;
        this.aiPaddle.userData.verticalPosition = 0;
    }
    
    createWalls() {
        this.debug.log("Creating game walls");
        
        // Create side walls
        const wallGeometry = new THREE.BoxGeometry(0.02, this.wallHeight, this.tableDepth);
        const wallMaterial = new THREE.MeshPhongMaterial({
            color: 0xaaaaaa,
            transparent: true,
            opacity: 0.5,
            shininess: 100
        });
        
        // Left wall
        const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
        leftWall.position.set(-this.tableWidth / 2 - 0.01, this.tableHeight + this.wallHeight / 2, 0);
        this.arScene.addObject(leftWall);
        this.walls.push(leftWall);
        
        // Add glow to left wall
        const leftGlowGeometry = new THREE.BoxGeometry(0.02, this.wallHeight * 1.1, this.tableDepth * 1.02);
        const leftGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x3388ff,
            transparent: true,
            opacity: 0.2,
            side: THREE.BackSide
        });
        const leftGlow = new THREE.Mesh(leftGlowGeometry, leftGlowMaterial);
        leftWall.add(leftGlow);
        
        // Right wall
        const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
        rightWall.position.set(this.tableWidth / 2 + 0.01, this.tableHeight + this.wallHeight / 2, 0);
        this.arScene.addObject(rightWall);
        this.walls.push(rightWall);
        
        // Add glow to right wall
        const rightGlowGeometry = new THREE.BoxGeometry(0.02, this.wallHeight * 1.1, this.tableDepth * 1.02);
        const rightGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x3388ff,
            transparent: true,
            opacity: 0.2,
            side: THREE.BackSide
        });
        const rightGlow = new THREE.Mesh(rightGlowGeometry, rightGlowMaterial);
        rightWall.add(rightGlow);
    }
    
    setupEventListeners() {
        // Track pointer for controlling player paddle
        const canvas = this.arScene.renderer.domElement;
        
        canvas.addEventListener('pointerdown', (event) => {
            this.pointerDown = true;
            this.updatePointerPosition(event);
        });
        
        canvas.addEventListener('pointermove', (event) => {
            if (this.pointerDown) {
                this.updatePointerPosition(event);
            }
        });
        
        canvas.addEventListener('pointerup', () => {
            this.pointerDown = false;
        });
        
        canvas.addEventListener('pointercancel', () => {
            this.pointerDown = false;
        });
    }
    
    updatePointerPosition(event) {
        // Calculate pointer delta
        const newX = (event.clientX / window.innerWidth) * 2 - 1;
        const newY = -((event.clientY / window.innerHeight) * 2 - 1);
        
        if (this.pointerDown) {
            this.pointerDelta.x = newX - this.lastPointerPosition.x;
            this.pointerDelta.y = newY - this.lastPointerPosition.y;
        }
        
        this.lastPointerPosition.x = newX;
        this.lastPointerPosition.y = newY;
        
        if (this.arScene.debugMode) {
            // Debug mode handling with direct mapping and 3D movement
            if (this.pointerDown) {
                // Horizontal movement
                const paddleX = this.playerPaddle.position.x + this.pointerDelta.x;
                const maxX = (this.tableWidth / 2) - (this.paddleWidth / 2);
                this.playerPaddle.position.x = Math.max(-maxX, Math.min(maxX, paddleX));
                
                // Vertical movement
                const paddleY = this.playerPaddle.position.y + (this.pointerDelta.y * this.verticalSensitivity);
                this.playerPaddle.position.y = Math.max(
                    this.tableHeight + this.paddleHeight/2,
                    Math.min(this.tableHeight + this.paddleVerticalRange, paddleY)
                );
                
                // Depth movement (based on vertical movement)
                const paddleZ = this.playerPaddle.position.z + (this.pointerDelta.y * this.depthSensitivity);
                const maxDepth = this.tableDepth/2;
                const minDepth = maxDepth - this.paddleDepthRange;
                this.playerPaddle.position.z = Math.max(minDepth, Math.min(maxDepth, paddleZ));
            }
        } else {
            // AR mode handling with local space ray intersection
            this.raycaster.setFromCamera(this.lastPointerPosition, this.arScene.camera);
            
            if (this.arScene.arAnchor) {
                const localRay = new THREE.Ray();
                localRay.copy(this.raycaster.ray)
                       .applyMatrix4(this.arScene.arAnchor.matrixWorld.invert());
                
                const intersectionPoint = new THREE.Vector3();
                if (localRay.intersectPlane(this.localTouchPlane, intersectionPoint)) {
                    // Horizontal movement
                    const maxX = (this.tableWidth / 2) - (this.paddleWidth / 2);
                    this.playerPaddle.position.x = Math.max(-maxX, Math.min(maxX, intersectionPoint.x));
                    
                    // Vertical and depth movement based on intersection point
                    const verticalPos = Math.max(
                        this.tableHeight + this.paddleHeight/2,
                        Math.min(this.tableHeight + this.paddleVerticalRange, intersectionPoint.y)
                    );
                    this.playerPaddle.position.y = verticalPos;
                    
                    const depthPos = Math.max(
                        this.tableDepth/2 - this.paddleDepthRange,
                        Math.min(this.tableDepth/2, intersectionPoint.z)
                    );
                    this.playerPaddle.position.z = depthPos;
                }
            }
        }
    }
    
    resetBall(initialStart = false) {
        // Position ball in the center of the table
        this.ball.position.x = 0;
        this.ball.position.z = 0;
        this.ball.position.y = this.tableHeight + this.ballRadius;
        
        if (initialStart) {
            // Add small delay before starting for first time
            setTimeout(() => {
                this.launchBall();
            }, 1000);
        } else {
            this.launchBall();
        }
    }
    
    launchBall() {
        // Randomize initial direction in 3D
        const horizontalAngle = Math.random() * Math.PI * 2;
        const verticalAngle = (Math.random() - 0.5) * Math.PI * 0.3; // Limit vertical angle
        
        this.ballVelocity.x = Math.cos(horizontalAngle) * Math.cos(verticalAngle) * this.ballSpeed;
        this.ballVelocity.y = Math.sin(verticalAngle) * this.ballSpeed;
        this.ballVelocity.z = Math.sin(horizontalAngle) * Math.cos(verticalAngle) * this.ballSpeed;
        
        // Ensure movement toward players
        if (Math.abs(this.ballVelocity.z) < 0.3) {
            this.ballVelocity.z = (this.ballVelocity.z > 0 ? 0.3 : -0.3);
        }
        
        // Save initial position
        this.lastPosition.copy(this.ball.position);
        
        // Launch effect
        this.emitParticles(
            this.ball.position.clone(),
            new THREE.Color(0x00ffff),
            30,
            0.15
        );
        
        this.playSound('launch');
    }

    update(deltaTime) {
        if (!this.isPlaying) return;
        
        // Store last position
        this.lastPosition.copy(this.ball.position);
        
        // Apply gravity
        this.ballVelocity.y += this.gravity * deltaTime;
        
        // Update ball position
        this.ball.position.x += this.ballVelocity.x * deltaTime;
        this.ball.position.y += this.ballVelocity.y * deltaTime;
        this.ball.position.z += this.ballVelocity.z * deltaTime;
        
        // Check floor/ceiling collisions
        if (this.ball.position.y < this.tableHeight + this.ballRadius) {
            this.ball.position.y = this.tableHeight + this.ballRadius;
            this.ballVelocity.y = -this.ballVelocity.y * this.groundDamping;
            this.playSound('wall');
            this.emitParticles(this.ball.position.clone(), new THREE.Color(0x3388ff), 20, 0.1);
        } else if (this.ball.position.y > this.tableHeight + this.playAreaHeight - this.ballRadius) {
            this.ball.position.y = this.tableHeight + this.playAreaHeight - this.ballRadius;
            this.ballVelocity.y = -this.ballVelocity.y * this.groundDamping;
            this.playSound('wall');
            this.emitParticles(this.ball.position.clone(), new THREE.Color(0x3388ff), 20, 0.1);
        }
        
        // Update trail effect
        this.updateTrail();
        
        // Update particle effects
        this.updateParticles(deltaTime);
        
        // Check for wall collisions
        if (Math.abs(this.ball.position.x) > this.tableWidth / 2 - this.ballRadius) {
            // Hit side wall, reverse X velocity
            this.ballVelocity.x *= -1;
            this.ball.position.x = Math.sign(this.ball.position.x) * (this.tableWidth / 2 - this.ballRadius);
            
            // Play wall hit sound
            this.playSound('wall');
            
            // Emit particle effect for wall hit
            this.emitParticles(
                this.ball.position.clone(),
                new THREE.Color(0x3388ff),
                20,
                0.1
            );
        }
        
        // Check for paddle collisions
        this.checkPaddleCollisions();
        
        // Check for scoring
        this.checkScoring();
        
        // Update AI paddle (simple AI that follows the ball)
        this.updateAI(deltaTime);
        
        // Add some rotation to the ball based on its velocity
        this.ball.rotation.x += this.ballVelocity.z * 2;
        this.ball.rotation.z -= this.ballVelocity.x * 2;
        
        // Update score indicators if any
        this.updateScoreIndicators(deltaTime);
    }
    
    checkPaddleCollisions() {
        // Player paddle collision
        if (this.ballVelocity.z > 0 && 
            this.ball.position.z + this.ballRadius > this.playerPaddle.position.z - this.paddleDepth/2 &&
            this.lastPosition.z + this.ballRadius <= this.playerPaddle.position.z - this.paddleDepth/2) {
            
            const paddleMinX = this.playerPaddle.position.x - this.paddleWidth/2;
            const paddleMaxX = this.playerPaddle.position.x + this.paddleWidth/2;
            const paddleMinY = this.playerPaddle.position.y - this.paddleHeight/2;
            const paddleMaxY = this.playerPaddle.position.y + this.paddleHeight/2;
            
            if (this.ball.position.x >= paddleMinX && 
                this.ball.position.x <= paddleMaxX &&
                this.ball.position.y >= paddleMinY &&
                this.ball.position.y <= paddleMaxY) {
                
                // Reflect ball
                this.ballVelocity.z *= -1.05;
                
                // Add angle based on hit position
                const hitX = (this.ball.position.x - this.playerPaddle.position.x) / (this.paddleWidth/2);
                const hitY = (this.ball.position.y - this.playerPaddle.position.y) / (this.paddleHeight/2);
                
                this.ballVelocity.x += hitX * 0.5;
                this.ballVelocity.y += hitY * 0.5;
                
                // Normalize velocity to maintain consistent speed
                const speed = Math.sqrt(
                    this.ballVelocity.x * this.ballVelocity.x +
                    this.ballVelocity.y * this.ballVelocity.y +
                    this.ballVelocity.z * this.ballVelocity.z
                );
                
                this.ballVelocity.multiplyScalar(this.ballSpeed / speed);
                
                // Position correction
                this.ball.position.z = this.playerPaddle.position.z - this.paddleDepth/2 - this.ballRadius;
                
                this.playSound('paddle');
                this.flashPaddle(this.playerPaddle);
                this.emitParticles(this.ball.position.clone(), new THREE.Color(0x00ff88), 30, 0.2);
            }
        }
        
        // AI paddle collision (similar logic)
        if (this.ballVelocity.z < 0 && 
            this.ball.position.z - this.ballRadius < this.aiPaddle.position.z + this.paddleDepth/2 &&
            this.lastPosition.z - this.ballRadius >= this.aiPaddle.position.z + this.paddleDepth/2) {
            
            const paddleMinX = this.aiPaddle.position.x - this.paddleWidth/2;
            const paddleMaxX = this.aiPaddle.position.x + this.paddleWidth/2;
            const paddleMinY = this.aiPaddle.position.y - this.paddleHeight/2;
            const paddleMaxY = this.aiPaddle.position.y + this.paddleHeight/2;
            
            if (this.ball.position.x >= paddleMinX && 
                this.ball.position.x <= paddleMaxX &&
                this.ball.position.y >= paddleMinY &&
                this.ball.position.y <= paddleMaxY) {
                
                this.ballVelocity.z *= -1.05;
                
                const hitX = (this.ball.position.x - this.aiPaddle.position.x) / (this.paddleWidth/2);
                const hitY = (this.ball.position.y - this.aiPaddle.position.y) / (this.paddleHeight/2);
                
                this.ballVelocity.x += hitX * 0.5;
                this.ballVelocity.y += hitY * 0.5;
                
                const speed = Math.sqrt(
                    this.ballVelocity.x * this.ballVelocity.x +
                    this.ballVelocity.y * this.ballVelocity.y +
                    this.ballVelocity.z * this.ballVelocity.z
                );
                
                this.ballVelocity.multiplyScalar(this.ballSpeed / speed);
                
                this.ball.position.z = this.aiPaddle.position.z + this.paddleDepth/2 + this.ballRadius;
                
                this.playSound('paddle');
                this.flashPaddle(this.aiPaddle);
                this.emitParticles(this.ball.position.clone(), new THREE.Color(0xff3366), 30, 0.2);
            }
        }
    }
    
    flashPaddle(paddle) {
        // Get the main material
        const material = paddle.material;
        const originalColor = material.color.clone();
        const originalOpacity = material.opacity;
        const originalEmissive = material.emissive ? material.emissive.clone() : new THREE.Color(0);
        
        // Get point light if present
        const pointLight = paddle.children.find(child => child instanceof THREE.PointLight);
        const originalIntensity = pointLight ? pointLight.intensity : 0;
        
        // Flash the paddle
        material.color.set(0xffffff);
        material.opacity = 1.0;
        if (material.emissive) material.emissive.set(0x444444);
        
        // Increase point light intensity
        if (pointLight) pointLight.intensity = 1.5;
        
        // Reset after a short time
        setTimeout(() => {
            material.color.copy(originalColor);
            material.opacity = originalOpacity;
            if (material.emissive) material.emissive.copy(originalEmissive);
            if (pointLight) pointLight.intensity = originalIntensity;
        }, 100);
    }
    
    playSound(type) {
        // Simple sound effect using Web Audio API
        // We create sounds programmatically since we can't use external files
        if (!this.audioContext) return;
        
        try {
            // Resume audio context if it was suspended (browser policy)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            switch (type) {
                case 'paddle':
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
                    oscillator.frequency.exponentialRampToValueAtTime(880, this.audioContext.currentTime + 0.1);
                    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
                    oscillator.start();
                    oscillator.stop(this.audioContext.currentTime + 0.1);
                    break;
                    
                case 'wall':
                    oscillator.type = 'square';
                    oscillator.frequency.setValueAtTime(220, this.audioContext.currentTime);
                    gainNode.gain.setValueAtTime(0.05, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.05);
                    oscillator.start();
                    oscillator.stop(this.audioContext.currentTime + 0.05);
                    break;
                    
                case 'score':
                    oscillator.type = 'sawtooth';
                    oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime);
                    oscillator.frequency.exponentialRampToValueAtTime(330, this.audioContext.currentTime + 0.3);
                    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                    oscillator.start();
                    oscillator.stop(this.audioContext.currentTime + 0.3);
                    break;
                    
                case 'launch':
                    oscillator.type = 'triangle';
                    oscillator.frequency.setValueAtTime(220, this.audioContext.currentTime);
                    oscillator.frequency.exponentialRampToValueAtTime(440, this.audioContext.currentTime + 0.2);
                    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
                    oscillator.start();
                    oscillator.stop(this.audioContext.currentTime + 0.2);
                    break;
                    
                case 'win':
                    // Create a more complex sound with multiple oscillators
                    const osc1 = this.audioContext.createOscillator();
                    const osc2 = this.audioContext.createOscillator();
                    const gain1 = this.audioContext.createGain();
                    const gain2 = this.audioContext.createGain();
                    
                    osc1.connect(gain1);
                    osc2.connect(gain2);
                    gain1.connect(this.audioContext.destination);
                    gain2.connect(this.audioContext.destination);
                    
                    osc1.type = 'sine';
                    osc2.type = 'triangle';
                    
                    // Play a little melody
                    osc1.frequency.setValueAtTime(440, this.audioContext.currentTime);
                    osc1.frequency.setValueAtTime(550, this.audioContext.currentTime + 0.2);
                    osc1.frequency.setValueAtTime(660, this.audioContext.currentTime + 0.4);
                    
                    osc2.frequency.setValueAtTime(220, this.audioContext.currentTime);
                    osc2.frequency.setValueAtTime(275, this.audioContext.currentTime + 0.2);
                    osc2.frequency.setValueAtTime(330, this.audioContext.currentTime + 0.4);
                    
                    gain1.gain.setValueAtTime(0.1, this.audioContext.currentTime);
                    gain1.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.6);
                    
                    gain2.gain.setValueAtTime(0.05, this.audioContext.currentTime);
                    gain2.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.6);
                    
                    osc1.start();
                    osc2.start();
                    osc1.stop(this.audioContext.currentTime + 0.6);
                    osc2.stop(this.audioContext.currentTime + 0.6);
                    break;
            }
        } catch (error) {
            this.debug.warn(`Error playing sound: ${error.message}`);
        }
    }
    
    createScoreIndicator(position, isPlayer) {
        // Create a floating text to indicate scoring
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        
        // Draw text on canvas
        context.fillStyle = isPlayer ? '#00ff88' : '#ff3366';
        context.font = 'bold 80px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('+1', 128, 64);
        
        // Create texture and sprite
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);
        sprite.position.y += 0.2; // Float above the table
        sprite.scale.set(0.2, 0.1, 1);
        
        // Add animation data
        sprite.userData = {
            lifetime: 0,
            maxLifetime: 1.5,
            initialY: sprite.position.y
        };
        
        this.arScene.addObject(sprite);
        this.scoreIndicators.push(sprite);
        
        return sprite;
    }
    
    updateScoreIndicators(deltaTime) {
        for (let i = 0; i < this.scoreIndicators.length; i++) {
            const indicator = this.scoreIndicators[i];
            
            // Update lifetime
            indicator.userData.lifetime += deltaTime;
            
            // If expired, remove
            if (indicator.userData.lifetime >= indicator.userData.maxLifetime) {
                this.arScene.removeObject(indicator);
                this.scoreIndicators.splice(i, 1);
                i--;
                continue;
            }
            
            // Animate
            const progress = indicator.userData.lifetime / indicator.userData.maxLifetime;
            
            // Float upward
            indicator.position.y = indicator.userData.initialY + (progress * 0.3);
            
            // Fade out
            indicator.material.opacity = 1 - Math.pow(progress, 2);
            
            // Scale down
            const scale = 1 - (progress * 0.3);
            indicator.scale.set(0.2 * scale, 0.1 * scale, 1);
        }
    }
    
    checkScoring() {
        // Ball passed player's paddle
        if (this.ball.position.z > this.tableDepth / 2 + this.ballRadius) {
            // AI scores
            this.aiScore++;
            this.updateScoreDisplay();
            
            // Create score indicator
            this.createScoreIndicator(this.ball.position.clone(), false);
            
            // Play score sound
            this.playSound('score');
            
            // Emit particles
            this.emitParticles(
                this.ball.position.clone(),
                new THREE.Color(0xff3366),
                40,
                0.25
            );
            
            // Reset the ball
            this.resetBall();
            
            // Check if game ended
            this.checkGameEnd();
        }
        
        // Ball passed AI's paddle
        if (this.ball.position.z < -this.tableDepth / 2 - this.ballRadius) {
            // Player scores
            this.playerScore++;
            this.updateScoreDisplay();
            
            // Create score indicator
            this.createScoreIndicator(this.ball.position.clone(), true);
            
            // Play score sound
            this.playSound('score');
            
            // Emit particles
            this.emitParticles(
                this.ball.position.clone(),
                new THREE.Color(0x00ff88),
                40,
                0.25
            );
            
            // Reset the ball
            this.resetBall();
            
            // Check if game ended
            this.checkGameEnd();
        }
    }
    
    checkGameEnd() {
        // Check if either player reached the winning score
        if (this.playerScore >= this.winningScore || this.aiScore >= this.winningScore) {
            const winner = this.playerScore > this.aiScore ? 'Player' : 'AI';
            this.debug.log(`Game over! ${winner} wins with score ${this.playerScore}-${this.aiScore}`);
            
            // Play win sound
            this.playSound('win');
            
            // Create celebratory particles
            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    const x = (Math.random() - 0.5) * this.tableWidth;
                    const z = (Math.random() - 0.5) * this.tableDepth;
                    const position = new THREE.Vector3(x, this.tableHeight + 0.1, z);
                    
                    const color = this.playerScore > this.aiScore 
                        ? new THREE.Color(0x00ff88) 
                        : new THREE.Color(0xff3366);
                    
                    this.emitParticles(position, color, 40, 0.3);
                }, i * 300);
            }
            
            // Reset game after a delay
            setTimeout(() => {
                this.playerScore = 0;
                this.aiScore = 0;
                this.updateScoreDisplay();
                this.resetBall(true);
                
                // Increase difficulty slightly for next game
                this.gameLevel++;
                this.ballSpeed = Math.min(0.5 + (this.gameLevel * 0.05), 0.8);
                
                this.debug.log(`New game started at level ${this.gameLevel} with ball speed ${this.ballSpeed}`);
            }, 3000);
        }
    }
    
    updateAI(deltaTime) {
        if (!this.ball) return;
        
        const difficulty = Math.min(0.4 + (this.gameLevel * 0.05), 0.9);
        const aiSpeed = this.aiPaddleMovementSpeed * difficulty;
        
        // Predict ball position
        const ballVelocity = this.ballVelocity.clone();
        const predictedPosition = this.ball.position.clone().add(
            ballVelocity.multiplyScalar(deltaTime * 60)
        );
        
        // Update AI paddle position smoothly
        if (this.ballVelocity.z < 0) {
            // Move towards predicted ball position
            const targetX = predictedPosition.x;
            const targetY = predictedPosition.y;
            const targetZ = -this.tableDepth/2 + 0.05; // Base position
            
            // Smoothly move towards target
            this.aiPaddle.position.x += (targetX - this.aiPaddle.position.x) * aiSpeed;
            this.aiPaddle.position.y += (targetY - this.aiPaddle.position.y) * aiSpeed;
            this.aiPaddle.position.z += (targetZ - this.aiPaddle.position.z) * aiSpeed;
            
            // Add some randomness for realism
            if (Math.random() < 0.05) {
                this.aiPaddle.position.x += (Math.random() - 0.5) * 0.05;
                this.aiPaddle.position.y += (Math.random() - 0.5) * 0.05;
                this.aiPaddle.position.z += (Math.random() - 0.5) * 0.02;
            }
        }
        
        // Clamp positions
        const maxX = (this.tableWidth / 2) - (this.paddleWidth / 2);
        this.aiPaddle.position.x = Math.max(-maxX, Math.min(maxX, this.aiPaddle.position.x));
        this.aiPaddle.position.y = Math.max(
            this.tableHeight + this.paddleHeight/2,
            Math.min(this.tableHeight + this.paddleVerticalRange, this.aiPaddle.position.y)
        );
        this.aiPaddle.position.z = Math.max(
            -this.tableDepth/2 - this.paddleDepthRange,
            Math.min(-this.tableDepth/2 + 0.05, this.aiPaddle.position.z)
        );
    }

    updateScoreDisplay() {
        if (this.playerScoreElement && this.aiScoreElement) {
            this.playerScoreElement.textContent = this.playerScore;
            this.aiScoreElement.textContent = this.aiScore;
        }
    }

    dispose() {
        this.debug.log("Disposing PongGame");
        
        // Clean up game objects
        if (this.table) this.arScene.removeObject(this.table);
        if (this.ball) this.arScene.removeObject(this.ball);
        if (this.playerPaddle) this.arScene.removeObject(this.playerPaddle);
        if (this.aiPaddle) this.arScene.removeObject(this.aiPaddle);
        
        // Clean up walls
        for (const wall of this.walls) {
            this.arScene.removeObject(wall);
        }
        
        // Clean up particles
        for (const ps of this.particlePool) {
            this.arScene.removeObject(ps);
        }
        
        // Clean up score indicators
        for (const indicator of this.scoreIndicators) {
            this.arScene.removeObject(indicator);
        }
        
        // Close audio context if it exists
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(console.error);
        }
        
        // Remove update callback
        this.arScene.removeUpdateCallback(this.update.bind(this));
        
        // Reset game state
        this.isPlaying = false;
        
        this.debug.log("PongGame disposed");
    }
}