const SELECTORS = {
  jobTitle: '.job-details-jobs-unified-top-card__job-title',
  companyName: '.job-details-jobs-unified-top-card__company-name',
  jobDescription: '.jobs-description__container',
  jobCard: '.job-card-container',
  jobCardFooter: '.job-card-list__footer-wrapper',
};

// Cache configuration
const CACHE_SIZE_LIMIT = 256;
const CACHE_STORAGE_KEY = 'jobAnalysisCache';
const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// In-memory cache for job analysis results
const memoryCache = new Map(); // Map<jobId, analysisResult>

// Auto analysis configuration
let isAutoAnalysisEnabled = false;

// Function to check if we're on the job search page
const isJobSearchPage = () => window.location.href.includes('/jobs/search/');

// Function to extract job ID from URL
const extractJobId = () => {
  // Try to extract from job details page URL: https://www.linkedin.com/jobs/view/{jobId}
  const viewMatch = window.location.href.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch?.[1]) {
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
    console.log(`Cache hit for job ${jobId}`);
    return cachedEntry.result;
  }

  console.log(`Cache miss for job ${jobId}`);
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
const loadCache = () => {
  chrome.storage.local.get([CACHE_STORAGE_KEY], (result) => {
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
  });
};

// Initialize cache when script loads
loadCache();

// Function to load auto analysis setting
const loadAutoAnalysisSetting = () => {
    chrome.storage.local.get(['autoAnalysisEnabled'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading auto analysis setting:', chrome.runtime.lastError);
            return;
        }

        isAutoAnalysisEnabled = result.autoAnalysisEnabled === true;
        console.log(`Auto analysis is ${isAutoAnalysisEnabled ? 'enabled' : 'disabled'}`);
    });
};

// Listen for changes to auto analysis setting
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.autoAnalysisEnabled) {
        isAutoAnalysisEnabled = changes.autoAnalysisEnabled.newValue === true;
        console.log(`Auto analysis setting changed to: ${isAutoAnalysisEnabled ? 'enabled' : 'disabled'}`);
    }
});

// Initialize auto analysis setting
loadAutoAnalysisSetting();

// Function to extract job title from LinkedIn (details and search panel)
const extractJobTitle = () => {
    const titleElement = document.querySelector(SELECTORS.jobTitle);
    return titleElement?.textContent.trim() ?? null;
};

// Function to extract company name from LinkedIn (details and search panel)
const extractCompanyName = () => {
    const companyElement = document.querySelector(SELECTORS.companyName);
    return companyElement?.textContent.trim() ?? null;
};

// Function to extract job description from LinkedIn (details and search panel)
const extractJobDescription = () => {
    const descriptionElement = document.querySelector(SELECTORS.jobDescription);
    return descriptionElement?.textContent.trim() ?? null;
};

// Function to analyze job description using Gemini API
const analyzeJobDescription = async (specificJobId = null) => {
    try {
        // Get the current job ID or use the provided one
        const jobId = specificJobId || extractJobId();

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
        const response = await fetch(API_ENDPOINT, {
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
            throw new Error(`API request failed with status: ${response.status}`);
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



// Helper function to show loading state on a button
const setButtonLoading = (button, isLoading) => {
    if (isLoading) {
        button.disabled = true;

        // Remove any existing spinner first
        const existingSpinner = button.querySelector('.bli-loading-spinner');
        if (existingSpinner) existingSpinner.remove();

        // Save the original text content if not already saved
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }

        // Update button text
        button.textContent = 'Analyzing...';

        // Create spinner element
        const spinner = document.createElement('span');
        spinner.className = 'bli-loading-spinner';

        // Append spinner to button
        button.appendChild(spinner);
        button.classList.add('button-loading');
    } else {
        button.disabled = false;

        // Remove spinner
        const spinner = button.querySelector('.bli-loading-spinner');
        if (spinner) spinner.remove();

        // Restore original text if available
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }

        button.classList.remove('button-loading');
    }
};

// Function to display analysis results
const displayAnalysisResults = (container, analysis, isCached = false) => {
    // Remove previous results
    const oldResults = container.querySelector('.job-analysis-results');
    if (oldResults) oldResults.remove();

    // Create results container
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'job-analysis-results';

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
        itemDiv.innerText = item;
        resultsDiv.appendChild(itemDiv);
    });

    // Add cached indicator if result is from cache
    if (isCached) {
        const cachedIndicator = document.createElement('div');
        cachedIndicator.className = 'cached-indicator';
        cachedIndicator.innerHTML = '<span class="cached-indicator-icon">&#8635;</span> Showing cached analysis';
        resultsDiv.appendChild(cachedIndicator);
    }

    container.appendChild(resultsDiv);
    return resultsDiv;
};

// --- Robustly inject Analyze Job button after job title (details and search panel) ---
const injectAnalyzeButton = async () => {
    // Try details page selectors
    const jobTitle = document.querySelector(SELECTORS.jobTitle);
    const h1 = jobTitle?.querySelector('h1');

    if (!jobTitle || !h1) return;
    if (jobTitle.parentNode.querySelector('.job-analysis-container')) return;

    // Create container
    const container = document.createElement('div');
    container.className = 'job-analysis-container';

    // Create analysis button with LinkedIn style
    const analyzeButton = document.createElement('button');
    analyzeButton.className = 'artdeco-button artdeco-button--secondary artdeco-button--3 job-analysis-button';
    analyzeButton.textContent = 'Analyze Job';

    // Add click handler
    analyzeButton.addEventListener('click', async () => {
        try {
            // Show loading state
            setButtonLoading(analyzeButton, true);

            // Force a new analysis even if we have a cached one
            const analysis = await analyzeJobDescription();

            if (analysis) {
                displayAnalysisResults(container, analysis, false);
            }

            // Reset button state
            setButtonLoading(analyzeButton, false);
        } catch (error) {
            console.error('Error displaying analysis:', error);
            alert('Failed to analyze job description');
            // Reset button state
            setButtonLoading(analyzeButton, false);
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
        } else if (isAutoAnalysisEnabled) {
            // If auto analysis is enabled and no cached result, trigger analysis automatically
            console.log(`Auto analysis triggered for job ${jobId}`);

            // Show loading state
            setButtonLoading(analyzeButton, true);

            try {
                // Trigger analysis
                const analysis = await analyzeJobDescription();

                if (analysis) {
                    displayAnalysisResults(container, analysis, false);
                }
            } catch (error) {
                console.error('Auto analysis failed:', error);
            } finally {
                // Reset button state
                setButtonLoading(analyzeButton, false);
            }
        }
    }
}


// --- Wait for job title or search panel using MutationObserver ---
let observer;
const observeForJobTitleOrSearchPanel = () => {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
        injectAnalyzeButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
};

// --- Watch for URL changes and job ID changes ---
let lastUrl = location.href;
let lastJobId = extractJobId();

const cleanupObservers = () => {
    if (observer) observer.disconnect();
};

window.addEventListener('beforeunload', cleanupObservers);

const watchUrlChangeAndClearAnalysis = () => {
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
            document.querySelectorAll('.job-analysis-container, .job-card-analysis-container').forEach(el => {
                el.remove();
            });

            // Re-inject the analyze button (which will check for cached analysis)
            setTimeout(() => {
                injectAnalyzeButton();

                // Re-enhance job cards if on search page
                if (isJobSearchPage()) {
                    enhanceJobCards();
                }
            }, 500);
        }
    }, 500);
};

// Function to display analysis results in job card
const displayJobCardAnalysisResults = (jobCard, analysis) => {
    // Find the footer wrapper
    const footerWrapper = jobCard.querySelector(SELECTORS.jobCardFooter);
    if (!footerWrapper) return;

    // Check if we already added analysis results
    if (jobCard.querySelector('.job-card-analysis-item')) return;

    // Define analysis items to display
    const items = [
        analysis.language,
        analysis.scope,
        analysis.programming,
        analysis.experience
    ];

    // Create and append each result item
    items.forEach(item => {
        if (!item) return; // Skip empty items

        // Create a list item for the analysis results
        const analysisLi = document.createElement('li');
        analysisLi.className = 'job-card-container__footer-item';

        const itemSpan = document.createElement('span');
        itemSpan.className = 'job-card-analysis-item';
        itemSpan.innerText = item;
        analysisLi.appendChild(itemSpan);

        // Add to the footer
        footerWrapper.appendChild(analysisLi);
    });
};

// Function to enhance job cards with analysis results
const enhanceJobCards = () => {
    if (!isJobSearchPage()) return;

    // Find all job cards
    const jobCards = document.querySelectorAll(SELECTORS.jobCard);

    jobCards.forEach(card => {
        // Extract job ID from the card
        const jobId = card.getAttribute('data-job-id');
        if (!jobId) return;

        // Check if we have a cached analysis for this job
        const cachedAnalysis = getFromCache(jobId);
        if (cachedAnalysis) {
            displayJobCardAnalysisResults(card, cachedAnalysis);
        }
    });
}

// Function to observe job cards on the search page
const observeJobCards = () => {
    if (!isJobSearchPage()) return;

    const jobCardsObserver = new MutationObserver(() => {
        enhanceJobCards();
    });

    // Observe the job search results container
    const jobsContainer = document.querySelector('.jobs-search-results-list');
    if (jobsContainer) {
        jobCardsObserver.observe(jobsContainer, { childList: true, subtree: true });
    } else {
        // If container not found, observe the body and check again when DOM changes
        jobCardsObserver.observe(document.body, { childList: true, subtree: true });
    }
}

// Function to initialize the extension
const initializeExtension = () => {
    console.log('Initializing Better LinkedIn extension with job analysis caching');

    // Start observers
    observeForJobTitleOrSearchPanel();
    watchUrlChangeAndClearAnalysis();

    // Enhance job cards on search page
    setTimeout(() => {
        enhanceJobCards();
        observeJobCards();
    }, 1000);
};

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
