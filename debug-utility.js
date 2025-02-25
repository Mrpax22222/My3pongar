export class DebugUtility {
    constructor() {
        this.debugContent = document.getElementById('debug-content');
        this.maxEntries = 100;
        this.entries = [];
        
        // Initialize debug panel if it doesn't exist
        if (!this.debugContent) {
            this.createDebugPanel();
        }
    }
    
    createDebugPanel() {
        // Create debug panel if not found in DOM
        const debugPanel = document.getElementById('debug-panel') || document.createElement('div');
        if (!debugPanel.id) {
            debugPanel.id = 'debug-panel';
            debugPanel.innerHTML = '<h3>Debug Info</h3><div id="debug-content"></div>';
            document.body.appendChild(debugPanel);
        }
        
        this.debugContent = document.getElementById('debug-content') || document.createElement('div');
        if (!this.debugContent.id) {
            this.debugContent.id = 'debug-content';
            debugPanel.appendChild(this.debugContent);
        }
    }
    
    log(...messages) {
        const message = messages.map(m => 
            typeof m === 'object' ? JSON.stringify(m) : String(m)
        ).join(' ');
        
        console.log(...messages);
        this.addEntry('log', message);
    }
    
    warn(...messages) {
        const message = messages.map(m => 
            typeof m === 'object' ? JSON.stringify(m) : String(m)
        ).join(' ');
        
        console.warn(...messages);
        this.addEntry('warn', message);
    }
    
    error(...messages) {
        const message = messages.map(m => 
            typeof m === 'object' ? JSON.stringify(m) : String(m)
        ).join(' ');
        
        console.error(...messages);
        this.addEntry('error', message);
        
        // Show debug panel when there's an error
        document.getElementById('debug-panel').classList.add('visible');
    }
    
    addEntry(type, message) {
        if (!this.debugContent) {
            this.createDebugPanel();
        }
        
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = type;
        entry.innerHTML = `<span class="time">[${timestamp}]</span> ${message}`;
        
        this.debugContent.appendChild(entry);
        this.entries.push(entry);
        
        // Limit the number of entries
        if (this.entries.length > this.maxEntries) {
            this.debugContent.removeChild(this.entries.shift());
        }
        
        // Auto-scroll to bottom
        this.debugContent.scrollTop = this.debugContent.scrollHeight;
    }
    
    clear() {
        if (!this.debugContent) return;
        
        this.debugContent.innerHTML = '';
        this.entries = [];
    }
}