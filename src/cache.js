// Cache configuration
const CACHE_SIZE_LIMIT = 256;
const CACHE_STORAGE_KEY = 'jobAnalysisCache';

// In-memory cache for job analysis results
const memoryCache = new Map(); // Map<jobId, analysisResult>

// Function to add an analysis result to the cache
const addToCache = (jobId, analysisResult) => {
    if (!jobId || !analysisResult) return;

    // If cache is at capacity, remove the oldest entry (FIFO)
    if (memoryCache.size >= CACHE_SIZE_LIMIT) {
        const oldestKey = memoryCache.keys().next().value;
        console.log(`Cache full, removing oldest entry: ${oldestKey}`);
        memoryCache.delete(oldestKey);
    }

    // Add the new entry to the cache
    memoryCache.set(jobId, {
        result: analysisResult,
        timestamp: Date.now()
    });

    // Save the updated cache to storage
    saveCache();
    console.log(`Added job ${jobId} to analysis cache. Cache size: ${memoryCache.size}`);
};

// Function to get an analysis result from the cache
const getFromCache = (jobId) => {
    if (!jobId) return null;

    const cachedEntry = memoryCache.get(jobId);
    if (cachedEntry) {
        return cachedEntry.result;
    }

    return null;
};

// Function to save the cache to chrome.storage.local
const saveCache = () => {
    try {
        // Convert Map to array of entries to preserve order
        const entriesArray = Array.from(memoryCache.entries());

        chrome.storage.local.set({ [CACHE_STORAGE_KEY]: entriesArray }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving cache:', chrome.runtime.lastError);
            } else {
                console.log(`Saved ${entriesArray.length} entries to persistent cache`);
            }
        });
    } catch (error) {
        console.error('Error saving cache:', error);
    }
};

// Function to load the cache from chrome.storage.local
const loadCache = async () => {
    const result = await chrome.storage.local.get([CACHE_STORAGE_KEY]);

    if (chrome.runtime.lastError) {
        console.error('Error loading cache:', chrome.runtime.lastError);
        return;
    }

    const cachedData = result[CACHE_STORAGE_KEY];
    if (cachedData) {
        // Clear existing cache
        memoryCache.clear();

        // Populate cache from storage
        cachedData.forEach(([jobId, data]) => {
            memoryCache.set(jobId, data);
        });

        console.log(`Loaded ${memoryCache.size} entries from persistent cache`);
    } else {
        console.log('No cached data found in storage');
    }
};
