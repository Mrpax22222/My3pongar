import * as THREE from 'three';

export class ARScene {
    constructor(debug) {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.session = null;
        this.referenceSpace = null;
        this.hitTestSource = null;
        this.localReferenceSpace = null;
        this.frameOfReference = null;
        this.xrHitTestSource = null;
        this.debug = debug;
        
        // Scene objects
        this.objects = [];
        
        // Lighting
        this.ambientLight = null;
        this.directionalLight = null;
        
        // Animation loop
        this.clock = new THREE.Clock();
        this.deltaTime = 0;
        this.animating = false;
        this.onUpdateCallbacks = [];
        
        // Debug mode for non-AR testing
        this.debugMode = false;
        this.controls = null;
        
        // AR setup state tracking
        this.arSetupComplete = false;
        this.arSetupAttempted = false;
        this.placementIndicator = null;
        this.arAnchor = null;
        
        // Store the WebGL context for later reference
        this.gl = null;
    }
    
    async initialize() {
        try {
            // Initialize Three.js scene
            this.setupScene();
            
            // Check if WebXR is available
            if (!navigator.xr) {
                this.debug.error('WebXR API not available in this browser');
                this.debugMode = true;
                this.setupDebugMode();
                return true;
            }
            
            // If user opted to use fallback mode
            if (window.useARFallbackMode) {
                this.debug.log('Using AR fallback mode as requested by user');
                this.debugMode = true;
                this.setupDebugMode();
                return true;
            }
            
            // Check if AR is supported
            this.debug.log('Checking AR session support...');
            const isArSupported = await navigator.xr.isSessionSupported('immersive-ar');
            
            if (!isArSupported) {
                this.debug.error('Immersive AR not supported on this device or browser');
                this.debugMode = true;
                this.setupDebugMode();
                return true;
            }
            
            this.debug.log('AR is supported on this device');
            
            // Initialize WebGL context
            await this.initializeGL();
            
            // Start AR session only when button is clicked
            return true;
        } catch (error) {
            this.debug.error('Error initializing AR scene:', error);
            this.debugMode = true;
            this.setupDebugMode();
            return false;
        }
    }
    
    async initializeGL() {
        if (!this.renderer) {
            throw new Error("Renderer not initialized");
        }
        
        // Get WebGL context
        this.gl = this.renderer.getContext();
        
        // Make context XR compatible
        try {
            await this.gl.makeXRCompatible();
            this.debug.log("WebGL context made XR compatible");
        } catch (error) {
            this.debug.error("Failed to make WebGL context XR compatible:", error);
            throw error;
        }
    }
    
    setupScene() {
        this.debug.log("Setting up THREE.js scene");
        
        // Create scene
        this.scene = new THREE.Scene();
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
        this.camera.position.set(0, 1.6, 0); // Set default camera position
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true, // Important for AR
            powerPreference: 'high-performance' // Request high performance
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        
        // Add renderer to DOM
        const container = document.getElementById('arContent');
        container.appendChild(this.renderer.domElement);
        
        // Add lights
        this.setupLights();
        
        this.debug.log("THREE.js scene setup complete");
    }
    
    setupLights() {
        // Ambient light
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(this.ambientLight);
        
        // Directional light
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(0, 10, 0);
        this.scene.add(this.directionalLight);
        
        // Add a hemisphere light for better outdoor lighting simulation
        const hemisphereLight = new THREE.HemisphereLight(0xddeeff, 0x202020, 0.5);
        this.scene.add(hemisphereLight);
    }
    
    setupDebugMode() {
        this.debug.log("Starting in debug mode (non-AR)");
        
        // Create a simple platform for the game
        const platform = new THREE.Mesh(
            new THREE.BoxGeometry(2, 0.1, 2),
            new THREE.MeshPhongMaterial({ color: 0x333333 })
        );
        platform.position.set(0, 1.2, -2); // Position where we'll look
        platform.receiveShadow = true;
        this.scene.add(platform);
        
        // Import OrbitControls dynamically
        import('three/addons/controls/OrbitControls.js').then(({ OrbitControls }) => {
            // Set up orbit controls for desktop debugging
            this.controls = new OrbitControls(this.camera, this.renderer.domElement);
            this.controls.target.set(0, 1.2, -2); // Look at the platform
            this.controls.update();
            
            // Set camera to a better initial position for debugging
            this.camera.position.set(0, 2, 0);
            
            // Add a grid and axes helper for orientation
            const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0x444444);
            this.scene.add(gridHelper);
            
            const axesHelper = new THREE.AxesHelper(1);
            this.scene.add(axesHelper);
            
            // Start animation loop
            this.animating = true;
            this.renderer.setAnimationLoop(this.renderDebug.bind(this));
            
            this.debug.log("Debug mode setup complete");
        }).catch(error => {
            this.debug.error("Failed to load OrbitControls:", error);
            
            // Fallback if OrbitControls fails to load
            this.camera.position.set(0, 2, 0);
            this.animating = true;
            this.renderer.setAnimationLoop(this.renderDebug.bind(this));
        });
    }
    
    renderDebug(timestamp) {
        const delta = this.clock.getDelta();
        
        // Update controls
        if (this.controls) {
            this.controls.update();
        }
        
        // Run update callbacks
        for (const callback of this.onUpdateCallbacks) {
            callback(delta);
        }
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
    }
    
    async startXRSession() {
        if (this.session) {
            this.debug.warn("Session already exists, ending it first");
            await this.endSession();
        }
        
        try {
            this.debug.log("Starting new WebXR session for AR...");
            
            // Define session features
            const sessionInit = {
                requiredFeatures: ['local', 'hit-test'],
                optionalFeatures: ['dom-overlay']
            };
            
            // Add dom-overlay if supported
            const uiElement = document.getElementById('ui');
            if (uiElement) {
                sessionInit.domOverlay = { root: uiElement };
                this.debug.log("Using DOM overlay for UI");
            }
            
            this.debug.log("Requesting immersive-ar session with options:", JSON.stringify(sessionInit));
            
            // Request session
            this.session = await navigator.xr.requestSession('immersive-ar', sessionInit);
            
            // Set up session
            await this.setupXRSession(this.session);
            
            return true;
        } catch (error) {
            this.debug.error("Failed to start XR session:", error);
            throw error;
        }
    }
    
    async setupXRSession(session) {
        try {
            // Set up base layer
            const baseLayer = new XRWebGLLayer(session, this.gl);
            await session.updateRenderState({
                baseLayer: baseLayer
            });
            
            // Get reference spaces
            this.referenceSpace = await session.requestReferenceSpace('local');
            const viewerSpace = await session.requestReferenceSpace('viewer');
            
            // Set up hit testing
            this.hitTestSource = await session.requestHitTestSource({
                space: viewerSpace
            });
            
            // Set up event listeners
            session.addEventListener('end', this.onSessionEnd.bind(this));
            
            this.debug.log("XR session setup complete");
            return true;
        } catch (error) {
            this.debug.error("Failed to set up XR session:", error);
            throw error;
        }
    }
    
    async endSession() {
        if (this.debugMode) {
            // Just stop the animation loop for debug mode
            this.renderer.setAnimationLoop(null);
            this.animating = false;
            this.debug.log("Ended debug mode session");
            return;
        }
        
        if (this.session) {
            this.debug.log("Ending AR session");
            try {
                await this.session.end();
                this.debug.log("AR session ended successfully");
            } catch (error) {
                this.debug.error('Error ending AR session:', error);
            }
        }
    }
    
    onSessionEnd() {
        this.debug.log('AR session ended');
        
        // Clean up resources
        this.session = null;
        if (this.hitTestSource) {
            this.hitTestSource = null;
        }
        
        // Stop animation loop
        this.animating = false;
        this.renderer.setAnimationLoop(null);
        this.arSetupComplete = false;
    }
    
    onWindowResize() {
        if (this.camera) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        }
        if (this.renderer) {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }
    
    createARContent() {
        if (this.arAnchor) return; // Content already created
        
        // Create a container for AR content
        this.arAnchor = new THREE.Object3D();
        this.arAnchor.userData = { placed: false };
        this.scene.add(this.arAnchor);
        
        // Signal that AR content is ready to be used
        this.debug.log("AR anchor created, ready to place content");
        document.dispatchEvent(new CustomEvent('ar-ready'));
    }
    
    placeARContent(position, orientation) {
        if (!this.arAnchor) this.createARContent();
        
        // Place the AR anchor at the hit test position AND orientation
        this.arAnchor.position.copy(position);
        if (orientation) {
            this.arAnchor.quaternion.copy(orientation);
            
            // Ensure the game surface stays horizontal by removing any rotation around X and Z axes
            const euler = new THREE.Euler().setFromQuaternion(this.arAnchor.quaternion);
            euler.x = 0;
            euler.z = 0;
            this.arAnchor.quaternion.setFromEuler(euler);
        }

        // Mark as placed
        this.arAnchor.userData.placed = true;

        this.debug.log(`Placed AR content at position: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`);

        // Hide the placement indicator
        if (this.placementIndicator) {
            this.placementIndicator.visible = false;
        }

        // Signal that AR content has been placed
        document.dispatchEvent(new CustomEvent('ar-placed'));
    }
    
    render(timestamp, frame) {
        if (!frame) {
            this.debug.warn("No XR frame available");
            return;
        }

        try {
            // Update delta time
            this.deltaTime = this.clock.getDelta();

            // Get viewer pose
            const session = frame.session;
            const pose = frame.getViewerPose(this.referenceSpace);

            if (pose) {
                // Process the pose
                const view = pose.views[0];

                // Update the camera from the pose
                const viewMatrix = new THREE.Matrix4().fromArray(view.transform.inverse.matrix);
                this.camera.matrix.copy(viewMatrix);
                this.camera.matrix.decompose(this.camera.position, this.camera.quaternion, this.camera.scale);

                // Detect surfaces via hit test if supported
                if (this.hitTestSource) {
                    const hitTestResults = frame.getHitTestResults(this.hitTestSource);

                    if (hitTestResults.length > 0) {
                        const hit = hitTestResults[0];
                        const hitPose = hit.getPose(this.referenceSpace);

                        if (hitPose) {
                            // Extract full transform matrix from hit pose
                            this.lastHitPoseMatrix = new THREE.Matrix4().fromArray(hitPose.transform.matrix);

                            // Update placement indicator position and orientation
                            if (this.placementIndicator && !this.arAnchor?.userData.placed) {
                                const position = new THREE.Vector3().setFromMatrixPosition(this.lastHitPoseMatrix);
                                const orientation = new THREE.Quaternion().setFromRotationMatrix(this.lastHitPoseMatrix);
                                
                                this.placementIndicator.position.copy(position);
                                this.placementIndicator.quaternion.copy(orientation);
                                
                                // Keep indicator horizontal
                                const euler = new THREE.Euler().setFromQuaternion(this.placementIndicator.quaternion);
                                euler.x = -Math.PI / 2; // Flat on surface
                                euler.z = 0;
                                this.placementIndicator.quaternion.setFromEuler(euler);
                                
                                this.placementIndicator.visible = true;
                                
                                // Animate scale
                                this.placementIndicator.userData.animTime += this.deltaTime;
                                const scale = 1 + 0.2 * Math.sin(this.placementIndicator.userData.animTime * 5);
                                this.placementIndicator.scale.set(scale, scale, scale);
                            }

                            // Check if user wants to place content
                            if (session.inputSources) {
                                for (const source of session.inputSources) {
                                    const gamepad = source.gamepad;
                                    if (gamepad?.buttons[0]?.pressed) {
                                        // Extract both position and orientation for placement
                                        const position = new THREE.Vector3().setFromMatrixPosition(this.lastHitPoseMatrix);
                                        const orientation = new THREE.Quaternion().setFromRotationMatrix(this.lastHitPoseMatrix);
                                        this.placeARContent(position, orientation);
                                    }
                                }
                            }
                        }
                    } else {
                        // No hit results found
                        if (this.placementIndicator) {
                            this.placementIndicator.visible = false;
                        }
                        this.debug.log("No surfaces detected, please scan the environment");
                    }
                }

                // Run update callbacks
                for (const callback of this.onUpdateCallbacks) {
                    callback(this.deltaTime, frame, this.referenceSpace);
                }

                // Set correct render target and viewport
                const baseLayer = session.renderState.baseLayer;
                const viewport = baseLayer.getViewport(view);
                this.renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);

                // Render the scene
                this.renderer.render(this.scene, this.camera);
            } else {
                this.debug.warn("No viewer pose available");
            }
        } catch (error) {
            this.debug.error("Error in AR render loop:", error);
        }
    }

    createPlacementIndicator() {
        // Create a simple ring to show where AR content can be placed
        const geometry = new THREE.RingGeometry(0.15, 0.2, 32);
        geometry.rotateX(-Math.PI / 2); // Make it horizontal
        
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        this.placementIndicator = new THREE.Mesh(geometry, material);
        this.placementIndicator.visible = false;
        this.scene.add(this.placementIndicator);
        
        // Add a pulsing animation
        this.placementIndicator.userData = {
            animTime: 0
        };
    }
    
    // Helper methods
    addObject(object) {
        // If we have an AR anchor, add objects to it instead of directly to the scene
        if (this.arAnchor && this.arAnchor.userData.placed) {
            this.arAnchor.add(object);
        } else {
            this.scene.add(object);
        }
        this.objects.push(object);
        return object;
    }

    removeObject(object) {
        if (this.arAnchor && object.parent === this.arAnchor) {
            this.arAnchor.remove(object);
        } else {
            this.scene.remove(object);
        }

        const index = this.objects.indexOf(object);
        if (index !== -1) {
            this.objects.splice(index, 1);
        }
    }

    addUpdateCallback(callback) {
        this.onUpdateCallbacks.push(callback);
    }

    removeUpdateCallback(callback) {
        const index = this.onUpdateCallbacks.indexOf(callback);
        if (index !== -1) {
            this.onUpdateCallbacks.splice(index, 1);
        }
    }

    // Create a horizontal plane at height above ground
    createHorizontalPlane(width, depth, color, height = 1.2) {
        const planeGeometry = new THREE.PlaneGeometry(width, depth);
        const planeMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });

        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2; // Rotate to horizontal
        plane.position.y = height; // Position at given height

        return this.addObject(plane);
    }
}