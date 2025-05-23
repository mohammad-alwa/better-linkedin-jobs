const SELECTORS = {
  jobTitle: '.job-details-jobs-unified-top-card__job-title',
  companyName: '.job-details-jobs-unified-top-card__company-name',
  jobDescription: '.jobs-description__container',
};

// Cache configuration
const CACHE_SIZE_LIMIT = 256;
const CACHE_STORAGE_KEY = 'jobAnalysisCache';

// In-memory cache for job analysis results
const memoryCache = new Map(); // Map<jobId, analysisResult>

// Function to extract job ID from URL
function extractJobId() {
  // Try to extract from job details page URL: https://www.linkedin.com/jobs/view/{jobId}
  const viewMatch = window.location.href.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch && viewMatch[1]) {
    return viewMatch[1];
  }

  // Try to extract from job search page URL: https://www.linkedin.com/jobs/search/?currentJobId={jobId}
  const searchParams = new URLSearchParams(window.location.search);
  const currentJobId = searchParams.get('currentJobId');
  if (currentJobId) {
    return currentJobId;
  }

  return null;
}

// Function to add an analysis result to the cache
function addToCache(jobId, analysisResult) {
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
}

// Function to get an analysis result from the cache
function getFromCache(jobId) {
  if (!jobId) return null;

  const cachedEntry = memoryCache.get(jobId);
  if (cachedEntry) {
    console.log(`Cache hit for job ${jobId}`);
    return cachedEntry.result;
  }

  console.log(`Cache miss for job ${jobId}`);
  return null;
}

// Function to save the cache to chrome.storage.local
function saveCache() {
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
}

// Function to load the cache from chrome.storage.local
function loadCache() {
  chrome.storage.local.get([CACHE_STORAGE_KEY], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading cache:', chrome.runtime.lastError);
      return;
    }

    if (result[CACHE_STORAGE_KEY]) {
      // Clear existing cache
      memoryCache.clear();

      // Populate cache from storage
      result[CACHE_STORAGE_KEY].forEach(([jobId, data]) => {
        memoryCache.set(jobId, data);
      });

      console.log(`Loaded ${memoryCache.size} entries from persistent cache`);
    } else {
      console.log('No cached data found in storage');
    }
  });
}

// Initialize cache when script loads
loadCache();


// Add CSS for spinner animation with namespaced class
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes betterLinkedinSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    .bli-loading-spinner { /* namespace for extension spinner */ }
`;
document.head.appendChild(styleSheet);

// Function to extract job title from LinkedIn (details and search panel)
function extractJobTitle() {
    let titleElement = document.querySelector(SELECTORS.jobTitle);
    if (titleElement) {
        return titleElement.textContent.trim();
    }
    return null;
}

// Function to extract company name from LinkedIn (details and search panel)
function extractCompanyName() {
    let companyElement = document.querySelector(SELECTORS.companyName);
    if (companyElement) {
        return companyElement.textContent.trim();
    }
    return null;
}

// Function to extract job description from LinkedIn (details and search panel)
function extractJobDescription() {
    let descriptionElement = document.querySelector(SELECTORS.jobDescription);
    if (descriptionElement) {
        return descriptionElement.textContent.trim();
    }
    return null;
}

// Function to analyze job description using Gemini API
async function analyzeJobDescription() {
    try {
        // Get the current job ID
        const jobId = extractJobId();

        // Get API key from storage
        const result = await chrome.storage.local.get(['geminiApiKey']);
        const apiKey = result.geminiApiKey;

        if (!apiKey) {
            throw new Error('API key not found');
        }

        // Extract job description and additional job details
        const jd = extractJobDescription();
        if (!jd) {
            throw new Error('Could not find job description');
        }

        const jobTitle = extractJobTitle();
        const companyName = extractCompanyName();

        // Prepare the prompt
        const prompt = `Analyze the following job description and provide answers to the questions below:

Job Title: ${jobTitle}
Company: ${companyName}

Job Description:
${jd}

Questions
language: what's the language of the JD
scope: Is it for Backend, Frontend, Fullstack, Manager, AI, DevOps or Other. If other be more specific in 3 words at most. You can add two scopes at most. Better to have one scope.
programming: what's the main programming language required?
experience: what's the experience level required? Add years of experience if mentioned.
`;


        // Make API call
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            language: { type: "STRING" },
                            scope: { type: "STRING" },
                            programming: { type: "STRING" },
                            experience: { type: "STRING" },
                        },
                        propertyOrdering: ["language", "scope", "programming", "experience"]
                    }
                }
            })
        });

        if (!response.ok) {
            throw new Error('API request failed');
        }

        const data = await response.json();

        // Extract and parse the JSON content from the API response
        const apiResult = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!apiResult) {
            throw new Error('No content found in API response');
        }

        try {
            const analysisResult = JSON.parse(apiResult);

            // Store the result in the cache if we have a job ID
            if (jobId) {
                addToCache(jobId, analysisResult);
            }

            return analysisResult;
        } catch (parseError) {
            console.error('Error parsing JSON response:', parseError);
            throw new Error('Failed to parse API response as JSON');
        }

    } catch (error) {
        console.error('Error analyzing job description:', error);
        return null;
    }
}


// Define common styles
const styles = {
    container: `
        margin-top: 12px;
        background: #f5f6f7;
        border-radius: 4px;
        padding: 16px;
        border: 1px solid #e0e0e0;
    `,
    button: `
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 600;
        border-radius: 3px;
        background: #ffffff;
        border: 1px solid #0a66c2;
        color: #0a66c2;
    `,
    results: `
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
    `,
    item: `
        display: inline-flex;
        align-items: center;
        background-color: #FDFDFD;
        border-radius: 16px;
        padding: 4px 12px;
        font-size: 14px;
        color: #0a66c2;
        font-weight: 600;
        border: 1px solid #E0E0E0;
    `,
    spinner: `
        margin-left: 8px;
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid #0a66c2;
        border-radius: 50%;
        border-top-color: transparent;
        animation: betterLinkedinSpin 1s linear infinite;
    `
};

// Helper function to show loading state on a button
function setButtonLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;

        // Remove any existing spinner first
        const existingSpinner = button.querySelector('.loading-spinner');
        if (existingSpinner) existingSpinner.remove();

        // Create new spinner
        const spinner = document.createElement('span');
        spinner.className = 'bli-loading-spinner'; // namespaced

        // Apply styles directly to ensure animation works
        spinner.style.marginLeft = '8px';
        spinner.style.display = 'inline-block';
        spinner.style.width = '16px';
        spinner.style.height = '16px';
        spinner.style.border = '2px solid #0a66c2';
        spinner.style.borderRadius = '50%';
        spinner.style.borderTopColor = 'transparent';
        spinner.style.animation = 'betterLinkedinSpin 1s linear infinite';

        button.appendChild(spinner);
        button.style.opacity = '0.8';
    } else {
        button.disabled = false;
        const spinner = button.querySelector('.loading-spinner');
        if (spinner) spinner.remove();
        button.style.opacity = '1';
    }
}



// Function to display analysis results
function displayAnalysisResults(container, analysis, isCached = false) {
    // Remove previous results
    const oldResults = container.querySelector('.job-analysis-results');
    if (oldResults) oldResults.remove();

    // Create results container
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'job-analysis-results';
    resultsDiv.style.cssText = styles.results;

    // Define analysis items to display
    const items = [
        analysis.language,
        analysis.scope,
        analysis.programming,
        analysis.experience
    ];

    // Create and append each result item as a LinkedIn-style pill
    items.forEach(item => {
        if (!item) return; // Skip empty items

        const itemDiv = document.createElement('div');
        itemDiv.className = 'job-analysis-item';
        itemDiv.style.cssText = styles.item;
        itemDiv.innerText = item;
        resultsDiv.appendChild(itemDiv);
    });

    // Add cached indicator if result is from cache
    if (isCached) {
        const cachedIndicator = document.createElement('div');
        cachedIndicator.className = 'cached-indicator';
        cachedIndicator.style.cssText = `
            font-size: 12px;
            color: #666;
            margin-top: 8px;
            display: flex;
            align-items: center;
        `;
        cachedIndicator.innerHTML = '<span style="color: #0a66c2; margin-right: 4px;">&#8635;</span> Showing cached analysis';
        resultsDiv.appendChild(cachedIndicator);
    }

    container.appendChild(resultsDiv);
    return resultsDiv;
}

// --- Robustly inject Analyze Job button after job title (details and search panel) ---
async function injectAnalyzeButton() {
    // Try details page selectors
    let jobTitle = document.querySelector(SELECTORS.jobTitle);
    let h1 = jobTitle ? jobTitle.querySelector('h1') : null;

    if (!jobTitle || !h1) return;
    if (jobTitle.parentNode.querySelector('.job-analysis-container')) return;

    // Create container
    const container = document.createElement('div');
    container.className = 'job-analysis-container';
    container.style.cssText = styles.container;

    // Create analysis button with LinkedIn style
    const analyzeButton = document.createElement('button');
    analyzeButton.className = 'artdeco-button artdeco-button--secondary artdeco-button--3';
    analyzeButton.textContent = 'Analyze Job';
    analyzeButton.style.cssText = styles.button;

    // Add click handler
    analyzeButton.addEventListener('click', async () => {
        try {
            // Show loading state
            setButtonLoading(analyzeButton, true);
            analyzeButton.textContent = 'Analyzing...';

            // Force a new analysis even if we have a cached one
            const analysis = await analyzeJobDescription();

            if (analysis) {
                displayAnalysisResults(container, analysis, false);
            }

            // Reset button state
            setButtonLoading(analyzeButton, false);
            analyzeButton.textContent = 'Analyze Job';
        } catch (error) {
            console.error('Error displaying analysis:', error);
            alert('Failed to analyze job description');
            // Reset button state
            setButtonLoading(analyzeButton, false);
            analyzeButton.textContent = 'Analyze Job';
        }
    });

    container.appendChild(analyzeButton);
    h1.parentNode.appendChild(container); // Insert as the last element within h1.parentNode

    // Check if we have a cached analysis for this job
    const jobId = extractJobId();
    if (jobId) {
        const cachedAnalysis = getFromCache(jobId);
        if (cachedAnalysis) {
            displayAnalysisResults(container, cachedAnalysis, true);
        }
    }
}


// --- Wait for job title or search panel using MutationObserver ---
let observer;
function observeForJobTitleOrSearchPanel() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
        injectAnalyzeButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// --- Watch for URL changes and job ID changes ---
let lastUrl = location.href;
let lastJobId = extractJobId();

function cleanupObservers() {
    if (observer) observer.disconnect();
}

window.addEventListener('beforeunload', cleanupObservers);

function watchUrlChangeAndClearAnalysis() {
    setInterval(() => {
        const currentUrl = location.href;
        const currentJobId = extractJobId();

        // Check if URL or job ID has changed
        if (currentUrl !== lastUrl || (currentJobId && currentJobId !== lastJobId)) {
            console.log('URL or job ID changed', {
                oldUrl: lastUrl,
                newUrl: currentUrl,
                oldJobId: lastJobId,
                newJobId: currentJobId
            });

            lastUrl = currentUrl;
            lastJobId = currentJobId;

            // Remove all analysis containers
            document.querySelectorAll('.job-analysis-container').forEach(el => {
                el.remove();
            });

            // Re-inject the analyze button (which will check for cached analysis)
            setTimeout(() => {
                injectAnalyzeButton();
            }, 500);
        }
    }, 500);
}

// Function to initialize the extension
function initializeExtension() {
    console.log('Initializing Better LinkedIn extension with job analysis caching');

    // Start observers
    observeForJobTitleOrSearchPanel();
    watchUrlChangeAndClearAnalysis();
}

// --- Start observing when DOM is ready ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM content loaded');
        initializeExtension();
    });
} else {
    console.log('DOM already loaded');
    initializeExtension();
}
