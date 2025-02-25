import * as THREE from 'three';
window.THREE = THREE; // Expose THREE globally for components that need it

import { ARScene } from './ar-scene.js';
import { PongGame } from './pong-game.js';
import { DebugUtility } from './debug-utility.js';

// Main application class
class App {
    constructor() {
        this.arScene = null;
        this.currentExperience = 'pong';
        this.pongGame = null;
        this.debug = new DebugUtility();
        
        // DOM Elements
        this.startARButton = document.getElementById('startAR');
        this.exitARButton = document.getElementById('exitAR');
        this.landingPage = document.getElementById('landing');
        this.arContent = document.getElementById('arContent');
        this.experienceItems = document.querySelectorAll('.experience-item');
        this.toggleDebugButton = document.getElementById('toggle-debug');
        
        // AR state
        this.arSupported = null; // null = unknown, true = supported, false = not supported
        this.arActive = false;
        this.arStartAttempts = 0;
        this.maxARStartAttempts = 3;
        
        // Create loading indicator
        this.createLoadingIndicator();
        
        // Check if browser is compatible with WebXR
        this.checkBrowserCompatibility();
        
        // Check AR support
        this.checkARSupport();
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Expose app instance globally for debugging
        window.app = this;
        
        this.debug.log("App initialized");
    }
    
    checkBrowserCompatibility() {
        // Check if the browser supports modules
        if (!('noModule' in document.createElement('script'))) {
            this.showARNotSupported("Your browser doesn't support modern JavaScript features needed for this app.");
            return;
        }

        // Check for WebGL support
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            this.showARNotSupported("WebGL is not supported by your browser, which is required for 3D graphics.");
            return;
        }
        
        this.debug.log("Browser compatibility check passed");
    }
    
    createLoadingIndicator() {
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = `
            <div class="spinner"></div>
            <span>Loading AR Experience...</span>
        `;
        document.body.appendChild(loadingIndicator);
        this.loadingIndicator = loadingIndicator;
    }
    
    showLoading() {
        this.loadingIndicator.classList.add('visible');
    }
    
    hideLoading() {
        this.loadingIndicator.classList.remove('visible');
    }
    
    async checkARSupport() {
        this.debug.log("Checking AR support...");
        
        if (!navigator.xr) {
            this.debug.error("WebXR not supported by your browser");
            this.showARNotSupported("WebXR not supported by your browser");
            this.arSupported = false;
            return;
        }
        
        try {
            const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!isSupported) {
                this.debug.error("AR is not supported by your device");
                this.showARNotSupported("AR is not supported by your device");
                this.arSupported = false;
            } else {
                this.debug.log("AR is supported on this device");
                this.arSupported = true;
            }
        } catch (err) {
            this.debug.error("Error checking AR support:", err);
            this.showARNotSupported("Error checking AR support: " + err.message);
            this.arSupported = false;
        }
    }
    
    showARNotSupported(message) {
        // Check if the notification element exists
        let arNotSupported = document.getElementById('arNotSupported');
        
        // If not, create it
        if (!arNotSupported) {
            arNotSupported = document.createElement('div');
            arNotSupported.id = 'arNotSupported';
            arNotSupported.innerHTML = `
                <div>
                    <h2>AR Not Supported</h2>
                    <p>${message}</p>
                    <p>Please try a compatible device with AR support.</p>
                    <p>Common issues:</p>
                    <ul style="text-align: left; margin: 10px 0;">
                        <li>Make sure you're using a recent Chrome, Safari, or Firefox browser</li>
                        <li>Ensure you're using HTTPS (required for AR)</li>
                        <li>If on Android, check that ARCore is installed and updated</li>
                        <li>If on iOS, ensure you're using iOS 12+ with ARKit</li>
                        <li>Make sure camera permissions are granted to the browser</li>
                    </ul>
                    <p>AR requires:</p>
                    <ul style="text-align: left; margin: 10px 0;">
                        <li>Android: ARCore compatible device with Chrome 79+</li>
                        <li>iOS: iPhone or iPad with iOS 12+ and Safari</li>
                    </ul>
                    <button id="dismissArWarning">OK</button>
                    <button id="tryFallbackMode">Use Fallback Mode</button>
                </div>
            `;
            document.body.appendChild(arNotSupported);
            
            document.getElementById('dismissArWarning').addEventListener('click', () => {
                arNotSupported.classList.remove('visible');
            });
            
            document.getElementById('tryFallbackMode').addEventListener('click', () => {
                arNotSupported.classList.remove('visible');
                this.startARButton.disabled = false;
                this.startARButton.style.opacity = 1;
                this.startARButton.textContent = "Start in Fallback Mode";
                this.debug.log("User opted to use fallback mode");
                window.useARFallbackMode = true;
            });
        } else {
            // Update the message if the element already exists
            arNotSupported.querySelector('p').textContent = message;
        }
        
        arNotSupported.classList.add('visible');
        this.startARButton.disabled = true;
        this.startARButton.style.opacity = 0.5;
    }
    
    initEventListeners() {
        // AR session controls
        this.startARButton.addEventListener('click', () => this.startARExperience());
        this.exitARButton.addEventListener('click', () => this.exitARExperience());
        
        // Experience selection
        this.experienceItems.forEach(item => {
            item.addEventListener('click', () => {
                const experience = item.dataset.experience;
                if (experience) {
                    this.selectExperience(experience, item);
                }
            });
        });
        
        // Debug panel toggle
        if (this.toggleDebugButton) {
            this.toggleDebugButton.addEventListener('click', () => {
                const debugPanel = document.getElementById('debug-panel');
                debugPanel.classList.toggle('visible');
            });
        }
        
        // AR content placement event
        document.addEventListener('ar-placed', () => {
            this.onARPlaced();
        });
        
        // AR ready event
        document.addEventListener('ar-ready', () => {
            this.onARReady();
        });
        
        // Handle window resize
        window.addEventListener('resize', this.onWindowResize.bind(this));
        
        // Attach to device orientation changes
        window.addEventListener('orientationchange', this.onWindowResize.bind(this));
        
        // Handle taps for AR placement
        document.addEventListener('touchstart', (event) => {
            if (this.arActive && this.arScene && !this.arScene.debugMode) {
                // Only process taps if we're in AR mode and not debug mode
                this.handleARTap(event);
            }
        });
        
        // Add permission request button
        this.createPermissionRequestUI();
    }
    
    createPermissionRequestUI() {
        // Create a button to request permissions explicitly
        const permissionButton = document.createElement('button');
        permissionButton.id = 'requestPermissions';
        permissionButton.textContent = "Grant Camera Access";
        permissionButton.style.display = 'none';
        permissionButton.style.position = 'absolute';
        permissionButton.style.bottom = '100px';
        permissionButton.style.left = '50%';
        permissionButton.style.transform = 'translateX(-50%)';
        permissionButton.style.zIndex = '1001';
        
        permissionButton.addEventListener('click', async () => {
            try {
                const constraints = { video: { facingMode: 'environment' } };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                
                // Stop the stream immediately, we just needed the permission
                stream.getTracks().forEach(track => track.stop());
                
                this.debug.log("Camera permission granted");
                permissionButton.style.display = 'none';
                
                // Try starting AR again
                this.startARExperience();
            } catch (error) {
                this.debug.error("Failed to get camera permission:", error);
                this.showARNotSupported("Camera permission denied: " + error.message);
            }
        });
        
        document.body.appendChild(permissionButton);
        this.permissionButton = permissionButton;
    }
    
    onWindowResize() {
        if (this.arScene) {
            this.arScene.onWindowResize();
        }
    }
    
    handleARTap(event) {
        if (!this.arScene || !this.arScene.lastHitPoseMatrix) return;
        
        // Create tap event to place content in AR
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(this.arScene.lastHitPoseMatrix);
        
        this.arScene.placeARContent(position);
        this.debug.log(`AR tap registered, placing content at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
    }
    
    onARReady() {
        this.debug.log("AR environment is ready");
        // We could show instructions or UI elements here
    }
    
    onARPlaced() {
        this.debug.log("AR content has been placed");
        // Now load the experience into the AR anchor
        this.loadExperience(this.currentExperience);
    }
    
    selectExperience(experienceId, element) {
        // Update UI
        this.experienceItems.forEach(item => item.classList.remove('active'));
        element.classList.add('active');
        
        // Set current experience
        this.currentExperience = experienceId;
        this.debug.log(`Selected experience: ${experienceId}`);
    }
    
    async startARExperience() {
        try {
            this.debug.log("Starting AR experience...");
            this.showLoading();
            
            // Pre-request camera permission
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } 
                });
                stream.getTracks().forEach(track => track.stop());
                this.debug.log("Camera permission granted");
            } catch (error) {
                this.debug.warn("Could not get camera permission:", error);
                if (this.permissionButton) {
                    this.permissionButton.style.display = 'block';
                }
                this.hideLoading();
                return;
            }
            
            // Hide landing page and show AR content
            this.landingPage.style.display = 'none';
            this.arContent.style.display = 'block';
            
            // Initialize AR scene if it doesn't exist
            if (!this.arScene) {
                this.debug.log("Initializing AR scene...");
                this.arScene = new ARScene(this.debug);
                
                // Initialize GL context first
                this.debug.log("Setting up WebGL context...");
                await this.arScene.initializeGL();
                
                const initialized = await this.arScene.initialize();
                if (!initialized) {
                    throw new Error("Failed to initialize AR scene");
                }
                this.debug.log("AR scene initialized successfully");
            }
            
            // Start the AR session
            if (!this.arScene.debugMode) {
                try {
                    await this.arScene.startXRSession();
                    this.debug.log("AR session started successfully");
                } catch (error) {
                    this.debug.error("Failed to start AR session:", error);
                    this.arStartAttempts++;
                    
                    if (this.arStartAttempts >= this.maxARStartAttempts) {
                        this.debug.warn(`Failed to start AR ${this.arStartAttempts} times, switching to fallback mode`);
                        window.useARFallbackMode = true;
                        this.arScene.debugMode = true;
                        this.arScene.setupDebugMode();
                    } else {
                        throw error;
                    }
                }
            }
            
            // Set AR as active
            this.arActive = true;
            
            // If in debug mode, load experience immediately
            if (this.arScene.debugMode) {
                this.loadExperience(this.currentExperience);
            } else {
                this.debug.log("Waiting for AR placement...");
                this.showARInstructions();
                this.arScene.createARContent();
            }
            
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            this.debug.error("Error starting AR experience:", error);
            this.showARNotSupported(error.message || "Failed to start AR experience");
            this.exitARExperience();
        }
    }
    
    showARInstructions() {
        // Create and show instructions overlay for AR placement
        let instructionsOverlay = document.getElementById('arInstructionsOverlay');
        
        if (!instructionsOverlay) {
            instructionsOverlay = document.createElement('div');
            instructionsOverlay.id = 'arInstructionsOverlay';
            instructionsOverlay.className = 'ar-instructions';
            instructionsOverlay.innerHTML = `
                <div class="instructions-content">
                    <h3>Place AR Content</h3>
                    <p>Move your device to scan the environment.</p>
                    <p>Tap on a detected surface to place the game.</p>
                </div>
            `;
            document.body.appendChild(instructionsOverlay);
            
            // Hide after AR content is placed
            document.addEventListener('ar-placed', () => {
                if (instructionsOverlay) {
                    instructionsOverlay.style.display = 'none';
                }
            });
        } else {
            instructionsOverlay.style.display = 'block';
        }
    }
    
    loadExperience(experienceId) {
        this.debug.log(`Loading experience: ${experienceId}`);
        
        // Clear any existing experience
        if (this.pongGame) {
            this.pongGame.dispose();
            this.pongGame = null;
        }
        
        // Initialize the selected experience
        switch (experienceId) {
            case 'pong':
                this.debug.log("Creating pong game...");
                this.pongGame = new PongGame(this.arScene, this.debug);
                this.pongGame.initialize();
                break;
            default:
                this.debug.log('Experience not yet implemented');
                break;
        }
    }
    
    async exitARExperience() {
        this.debug.log("Exiting AR experience");
        
        // Clean up current experience
        if (this.pongGame) {
            this.pongGame.dispose();
            this.pongGame = null;
        }
        
        // End AR session
        if (this.arScene) {
            await this.arScene.endSession();
        }
        
        // Set AR as inactive
        this.arActive = false;
        
        // Hide any AR instructions
        const instructions = document.getElementById('arInstructionsOverlay');
        if (instructions) {
            instructions.style.display = 'none';
        }
        
        // Return to landing page
        this.arContent.style.display = 'none';
        this.landingPage.style.display = 'flex';
    }
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create global debug handler for uncaught errors
    window.addEventListener('error', (event) => {
        const debugContent = document.getElementById('debug-content');
        if (debugContent) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'error';
            errorMsg.textContent = `ERROR: ${event.message} at ${event.filename}:${event.lineno}`;
            debugContent.appendChild(errorMsg);
            document.getElementById('debug-panel').classList.add('visible');
        }
        console.error('Uncaught error:', event);
    });
    
    // Create global debug handler for promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        const debugContent = document.getElementById('debug-content');
        if (debugContent) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'error';
            errorMsg.textContent = `UNHANDLED PROMISE REJECTION: ${event.reason}`;
            debugContent.appendChild(errorMsg);
            document.getElementById('debug-panel').classList.add('visible');
        }
        console.error('Unhandled promise rejection:', event);
    });
    
    const app = new App();
});