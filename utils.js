const Utils = {
    EARTH_RADIUS: 6371000,
    DEBUG_MODE: false,

    wgs84ToLocal: function(lat1, lon1, lat2, lon2, alt = 0) {
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        
        const x = dLon * Math.cos(this.toRadians(lat1)) * this.EARTH_RADIUS;
        const z = dLat * this.EARTH_RADIUS;
        const y = -alt;
        
        return { x, y, z };
    },

    toRadians: function(degrees) {
        return degrees * Math.PI / 180;
    },

    toDegrees: function(radians) {
        return radians * 180 / Math.PI;
    },

    calculateDistance: function(lat1, lon1, lat2, lon2) {
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return this.EARTH_RADIUS * c;
    },

    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    throttle: function(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    showToast: function(message, duration = 3000) {
        const toast = document.getElementById('toast');
        if (!toast) {
            console.log('Toast:', message);
            return;
        }
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    },

    updateLoadingStatus: function(status) {
        const loadingStatus = document.getElementById('loading-status');
        if (loadingStatus) {
            loadingStatus.textContent = status;
        }
        console.log('Loading:', status);
    },

    clamp: function(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    lerp: function(start, end, t) {
        return start + (end - start) * t;
    },

    isMobileDevice: function() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    logError: function(tag, error) {
        console.error(`[${tag}]`, error);
    },

    logInfo: function(tag, message) {
        if (this.DEBUG_MODE) {
            console.info(`[${tag}]`, message);
        }
    },

    decimalToDMS: function(decimal, isLatitude) {
        const degrees = Math.floor(Math.abs(decimal));
        const minutesFloat = (Math.abs(decimal) - degrees) * 60;
        const minutes = Math.floor(minutesFloat);
        const seconds = ((minutesFloat - minutes) * 60).toFixed(1);
        
        let direction = '';
        if (isLatitude) {
            direction = decimal >= 0 ? 'N' : 'S';
        } else {
            direction = decimal >= 0 ? 'E' : 'W';
        }
        
        return `${direction} ${degrees}°${minutes}'${seconds}"`;
    }
};

export { Utils };
