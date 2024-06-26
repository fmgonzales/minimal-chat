import {
    wrapCodeSnippets,
    getConversationTitleFromGPT,
    showToast
} from '../js/utils.js';
import {
    loadConversationTitles,
    loadStoredConversations,
    generateDALLEImage,
    fetchGPTResponseStream, 
    fetchLocalModelResponseStream
} from '../js/gpt-api-access.js';
import {
    fetchPalmResponse,
    fetchPalmConversationTitle
} from '../js/palm-api-access.js';
import {
    fetchClaudeConversationTitle,
    streamClaudeResponse
} from '../js/claude-api-access.js';
import {
    analyzeImage
} from '../js/image-analysis.js';
import "../node_modules/swiped-events/dist/swiped-events.min.js";

const ko = window.ko;
const messagesContainer = document.querySelector('.messages');

export function AppViewModel() {
    const self = this;

    //#region  Startup assignments
    self.userInput = ko.observable('');
    self.isGeneratingImage = ko.observable(false);
    self.userSearchInput = ko.observable('');
    self.isProcessing = ko.observable(false);
    self.shouldShowScrollButton = ko.observable(false);
    self.messages = ko.observableArray([]);
    self.isLoading = ko.observable(false);
    self.isAnalyzingImage = ko.observable(false);
    self.sliderValue = ko.observable(localStorage.getItem('gpt-attitude') || 50);
    self.palmSliderValue = ko.observable(localStorage.getItem('palm-attitude') || 50);
    self.claudeSliderValue = ko.observable(localStorage.getItem('claude-attitude') || 50);
    self.localSliderValue = ko.observable(localStorage.getItem('local-attitude') || 50);
    self.isSidebarOpen = ko.observable(false);
    self.showConversationOptions = ko.observable(false);
    self.streamedMessageText = ko.observable();
    self.showingSearchField = ko.observable(false);
    self.hasFilterText = ko.observable(false);
    self.filteredMessages = ko.observableArray([]);
    self.isPalmEnabled = ko.observable(false);
    self.isClaudeEnabled = ko.observable(false);
    self.isUsingLocalModel = ko.observable(localStorage.getItem('useLocalModel') || false);
    self.lastLoadedConversationId = ko.observable(null);
    self.localModelName = ko.observable(localStorage.getItem('localModelName') || '');
    self.localModelEndpoint = ko.observable(localStorage.getItem('localModelEndpoint') || '');
    self.selectedModel = ko.observable(localStorage.getItem('selectedModel') || 'gpt-3.5-turbo');
    self.selectedAutoSaveOption = ko.observable(localStorage.getItem('selectedAutoSaveOption') || true);
    self.selectedDallEImageCount = ko.observable(localStorage.getItem('selectedImageCountOption') || '4');
    self.selectedDallEImageResolution = ko.observable(localStorage.getItem('selectedImageResolutionOption') || '256x256');
    self.filterText = ko.observable("");

    hljs.configure({
        ignoreUnescapedHTML: true
    });

    self.conversationTitles = ko.observableArray(loadConversationTitles());
    self.storedConversations = ko.observableArray(loadStoredConversations());
    self.selectedConversation = ko.observable(self.storedConversations()[self.storedConversations().length]);
    self.conversations = ko.observableArray(loadConversationTitles());
    self.selectedConversation(self.conversations()[0]);
    self.displayConversations = ko.computed(() => self.conversations());

    // Custom binding handlers
    ko.bindingHandlers.stopClickPropagation = {
        init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            element.addEventListener('click', function (event) {
                event.stopPropagation();
            });
        }
    };

    // Event listeners and element setup
    const floatingSearchField = document.getElementById('floating-search-field');
    floatingSearchField.addEventListener('transitionend', zIndexAfterTransition);
    floatingSearchField.style.zIndex = '-9999';

    const apiKey = document.getElementById('api-key');
    apiKey.value = localStorage.getItem("gptKey");
    apiKey.addEventListener("blur", () => {
        if (apiKey.value.trim() !== "") {
            localStorage.setItem("gptKey", apiKey.value.trim());
        }
    });

    const localModel = document.getElementById('model-name');
    localModel.value = localStorage.getItem("localModelName");
    localModel.addEventListener("blur", () => {
        if (localModel.value.trim() !== "") {
            localStorage.setItem("localModelName", localModel.value.trim());
        }
    });

    const localModelEndpoint = document.getElementById('local-model-endpoint');
    localModelEndpoint.value = localStorage.getItem("localModelEndpoint");
    localModelEndpoint.addEventListener("blur", () => {
        if (localModelEndpoint.value.trim() !== "") {
            localStorage.setItem("localModelEndpoint", localModelEndpoint.value.trim());
        }
    });

    const palmApiKey = document.getElementById('palm-api-key');
    palmApiKey.value = localStorage.getItem("palmKey");

    const claudeApiKey = document.getElementById('claude-api-key');
    claudeApiKey.value = localStorage.getItem("claudeKey");
    claudeApiKey.addEventListener("blur", () => {
        if (claudeApiKey.value.trim() !== "") {
            localStorage.setItem("claudeKey", claudeApiKey.value.trim());
        }
    });

    palmApiKey.addEventListener("blur", () => {
        if (palmApiKey.value.trim() !== "") {
            localStorage.setItem("palmKey", palmApiKey.value.trim());
        }
    });

    // Subscriptions
    self.sliderValue.subscribe((attitude) => {
        localStorage.setItem("gpt-attitude", attitude);
    });

    self.palmSliderValue.subscribe((attitude) => {
        localStorage.setItem("palm-attitude", attitude);
    });

    self.claudeSliderValue.subscribe((attitude) => {
        localStorage.setItem("claude-attitude", attitude);
    });

    self.localSliderValue.subscribe((attitude) => {
        localStorage.setItem("local-attitude", attitude);
    });

    // Blur timeout
    let blurTimeout;
    self.onUserSearchBlur = function (event) {
        clearTimeout(blurTimeout);
        blurTimeout = setTimeout(function () {
            self.showSearchField();
        }, 200);
    };

    function zIndexAfterTransition() {
        if (!self.showingSearchField()) {
            this.style.zIndex = '-9999';
        }
    }

    const appBody = document.getElementById('app-container');
    const userInput = document.getElementById('user-input');

    self.autoResize = function () {
        if (!self.userInput() || self.userInput().trim() === "") {

            userInput.style.height = '30px';
            return;
        }

        userInput.style.height = 'auto';
        userInput.style.height = `${userInput.scrollHeight - 15}px`;
    }

    // Local storage setup
    if (!localStorage.getItem('selectedModel')) {
        localStorage.setItem('selectedModel', self.selectedModel());
    }
    if (!localStorage.getItem('selectedAutoSaveOption')) {
        localStorage.setItem('selectedAutoSaveOption', self.selectedAutoSaveOption());
    }

    // Swipe events
    self.swipedLeft = function () {
        self.isSidebarOpen(false);
        self.showConversationOptions(!self.showConversationOptions());
    };

    self.swipedRight = function () {
        self.showConversationOptions(false);
        self.isSidebarOpen(!self.isSidebarOpen());
    };

    const userSearchInputField = document.getElementById('user-search-input');
    userSearchInputField.addEventListener('input', self.autoResize);
    userSearchInputField.addEventListener('focus', self.autoResize);

    self.filterMessages = ko.computed(function () {
        const searchQuery = self.filterText().toLowerCase().trim();

        if (searchQuery.length === 0) {
            self.hasFilterText(false);
            return self.messages();
        }

        self.hasFilterText(true);

        return self.messages().filter((message) =>
            message.content.toLowerCase().includes(searchQuery)
        );
    });

    // Save selected options
    self.saveSelectedModel = function () {
        localStorage.setItem('selectedModel', self.selectedModel());
        self.messages.valueHasMutated();
    };

    self.saveSelectedAutoSaveOption = function () {
        localStorage.setItem('selectedAutoSaveOption', self.selectedAutoSaveOption());
    };

    self.saveSelectedDallEImageCountOption = function () {
        localStorage.setItem('selectedImageCountOption', self.selectedDallEImageCount());
    };

    self.saveSelectedDallEImageResolutionOption = function () {
        localStorage.setItem('selectedImageResolutionOption', self.selectedDallEImageResolution());
    };

    // Subscriptions for selected options
    self.selectedModel.subscribe(() => {
        self.saveSelectedModel();
        if (self.selectedModel() === "chat-bison-001") {
            self.palmMessages = [];
            for (const chatMessage of self.messages()) {
                self.palmMessages.push({
                    content: chatMessage.content
                });
            }
        }
        if (self.selectedModel() === "claude-3-opus-20240229") {
            self.claudeMessages = [];
            for (const chatMessage of self.messages()) {
                self.claudeMessages.push({
                    role: chatMessage.role,
                    content: chatMessage.content
                });
            }
        }

        if(self.selectedModel() === "lmstudio") {
            localStorage.setItem("useLocalModel", true);
            self.isUsingLocalModel(true);
        }
        else {
            localStorage.setItem("useLocalModel", false);
            self.isUsingLocalModel(false);
        }
    });

    self.selectedAutoSaveOption.subscribe(() => {
        self.saveSelectedAutoSaveOption();
    });

    self.selectedDallEImageCount.subscribe(() => {
        self.saveSelectedDallEImageCountOption();
    });

    self.selectedDallEImageResolution.subscribe(() => {
        self.saveSelectedDallEImageResolutionOption();
    });

    // Show conversations click handler
    self.onShowConversationsClick = async function () {
        self.showConversationOptions(!self.showConversationOptions());
    };

    // Document click event
    document.addEventListener('click', (event) => {
        if (
            !event.target.closest('.sidebar') &&
            !event.target.closest('.settings-btn') && !event.target.closest('.saved-conversations-dropdown')
        ) {
            self.isSidebarOpen(false);
            self.showConversationOptions(false);
        }
    });

    // Toggle sidebar
    self.toggleSidebar = () => {
        self.isSidebarOpen(!self.isSidebarOpen());
        if (self.isSidebarOpen()) {
            const apiKey = document.getElementById('api-key');
            apiKey.value = localStorage.getItem("gptKey");
            const palmApiKey = document.getElementById('palm-api-key');
            palmApiKey.value = localStorage.getItem("palmKey");
        }
    };

    // Update scroll button visibility
    self.updateScrollButtonVisibility = function () {
        const messages = messagesContainer.querySelectorAll('.message');
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            const rect = lastMessage.getBoundingClientRect();
            if (!isScrollable(messagesContainer)) {
                self.shouldShowScrollButton(false);
                return;
            }
            if ((parseFloat(rect.bottom) * 0.001) > 0.75) {
                self.shouldShowScrollButton(true);
            } else {
                self.shouldShowScrollButton(false);
            }
        }
    };

    messagesContainer.addEventListener('scroll', self.updateScrollButtonVisibility);

    function isScrollable(element) {
        return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
    }

    // Hotkeys
    hotkeys('ctrl+shift+m', function (event, handler) {
        event.preventDefault();
        self.isSidebarOpen(false);
        self.showConversationOptions(true);
    });

    hotkeys('ctrl+shift+s', function (event, handler) {
        event.preventDefault();
        self.showConversationOptions(false);
        self.isSidebarOpen(true);
    });

    hotkeys('ctrl+shift+i', function (event, handler) {
        event.preventDefault();
        self.clearMessages();
    });

    hotkeys('ctrl+shift+f', function (event, handler) {
        event.preventDefault();
        self.showSearchField();
    });

    // User input keypress event
    userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault();
            self.userInput(self.userInput() + " \n");
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            self.sendMessage();
        }
    });
    //#endregion

    // Load selected conversation
    self.loadSelectedConversation = async function (value) {
        if (value) {
            self.selectedConversation(value.conversation);
            self.lastLoadedConversationId(value.id);
            localStorage.setItem('lastConversationId', self.lastLoadedConversationId());
        }

        if (!self.selectedConversation() || !self.selectedConversation()?.messageHistory) {
            return;
        }

        const selectedMessages = self.selectedConversation().messageHistory;
        self.messages(selectedMessages);
        self.showConversationOptions(false);

        if (self.selectedModel().indexOf("claude") !== -1) {
            self.claudeMessages = selectedMessages.map(chatMessage => ({
                role: chatMessage.role,
                content: chatMessage.content
            }));
        }

        if (self.selectedModel().indexOf("bison") !== -1) {
            self.palmMessages = selectedMessages.map(chatMessage => ({
                role: chatMessage.role,
                content: chatMessage.content
            }));
        }
    };

    // Show search field
    self.showSearchField = async function (isFromSearch) {
        clearTimeout(blurTimeout);
        if (!self.showingSearchField()) {
            floatingSearchField.style.zIndex = '9999';
        }
        self.showingSearchField(!self.showingSearchField());
    };

    /**
     * Deletes the current conversation and updates the stored conversations UI accordingly.
     *
     * @function
     * @async
     * @memberof self
     * @returns {Promise<void>}
     *
     * @description
     * This function performs the following steps:
     * 1. Checks if there is a currently loaded conversation. If not, it returns.
     * 2. Sets the processing state to true.
     * 3. Loads the stored conversations from local storage.
     * 4. Finds the index of the current conversation in the stored conversations array.
     * 5. If the conversation is found, it removes it from the stored conversations array and updates local storage.
     * 6. Updates the stored conversations observable with the modified array.
     * 7. Clears the messages, palmMessages, and claudeMessages observables.
     * 8. Loads the conversation titles from local storage.
     * 9. Updates the conversationTitles and conversations observables with the loaded titles.
     * 10. Sets the lastLoadedConversationId to null and updates local storage.
     * 11. If there are any remaining conversations, it loads the first one.
     * 12. Sets the processing state to false.
     */
    self.deleteCurrentConversation = async function () {
        if (self.lastLoadedConversationId() === null) {
            return;
        }

        self.isProcessing(true);
        const storedConversations = loadStoredConversations();

        const conversationIndex = storedConversations.findIndex(
            (conversation) => conversation.id === parseInt(self.lastLoadedConversationId())
        );

        if (conversationIndex !== -1) {
            storedConversations.splice(conversationIndex, 1);
            localStorage.setItem("gpt-conversations", JSON.stringify(storedConversations));
        }

        self.storedConversations(storedConversations);

        self.messages([]);
        self.palmMessages = [];
        self.claudeMessages = [];

        const conversationTitles = loadConversationTitles();

        self.conversationTitles(conversationTitles);
        self.conversations(conversationTitles);
        self.lastLoadedConversationId(null);

        localStorage.setItem("lastConversationId", null);

        if (self.conversations().length > 0) {
            this.loadSelectedConversation(self.conversations()[0]);
        }

        self.isProcessing(false);
        showToast("Conversation Deleted");
    };

    function updateUI(content, reset) {

        if (reset === true) {
            self.streamedMessageText("");
            self.scrollToBottom();
            return;
        }

        self.streamedMessageText((self.streamedMessageText() || "") + content);
        self.scrollToBottom();
    }

    // Image input event listener
    document.getElementById('imageInput').addEventListener('change', async function (event) {
        const file = event.target.files[0];
        const fileType = file.type;

        if (!file) {
            return;
        }

        let visionReponse = await processImage(file, fileType);

        addMessage("assistant", visionReponse);

        if (self.isClaudeEnabled()) {
            self.claudeMessages.push({
                role: "assistant",
                content: visionReponse
            });
        }

        self.saveMessages();
        self.isAnalyzingImage(false);
        self.scrollToBottom();
    });

    async function processImage(file, fileType) {
        self.userInput("");
        userInput.style.height = '30px';

        return await analyzeImage(file, fileType, self.messages().slice(0), self.selectedModel());
    }

    // Add message to messages array
    function addMessage(role, message) {
        self.messages.push({
            role: role,
            content: message
        });
    }

    // Initialize message arrays
    self.palmMessages = [];
    self.claudeMessages = [];
    let lastMessageText;

    /**
    * Sends a user message to the selected model (GPT, Palm, Claude, Image, or Vision) and handles the response.
    *
    * @async
    * @function sendMessage
    * @memberof self
    * @returns {Promise<void>}
    *
    * @description
    * The function performs the following steps:
    * 1. Trims the user input and assigns it to the 'messageText' variable.
    * 2. Updates the 'lastMessageText' variable with the current 'messageText'.
    * 3. Checks the selected model:
    *    - If "bison" is in the model name, calls 'sendPalmMessage' with the 'messageText' and returns.
    *    - If "claude" is in the model name, calls 'sendClaudeMessage' with the 'messageText' and returns.
    * 4. Disables Palm and Claude modes by setting 'isPalmEnabled' and 'isClaudeEnabled' observables to false.
    * 5. Adds the user message to the chat using the 'addMessage' function with the role "user" and the 'messageText'.
    * 6. If any of the following conditions are true, the function returns without further processing:
    *    - 'messageText' is empty or an empty string
    *    - 'isLoading' observable is true (indicating a loading state)
    *    - 'isGeneratingImage' observable is true (indicating an image generation state)
    * 7. If 'messageText' starts with "image::" (case-insensitive):
    *    - Calls 'sendImagePrompt' with the 'messageText' and returns.
    * 8. If 'messageText' starts with "vision::" (case-insensitive):
    *    - Calls 'sendVisionPrompt' and returns.
    * 9. If none of the above conditions are met, calls 'sendGPTMessage' with the 'messageText'.
    */
    self.sendMessage = async function () {
        const messageText = self.userInput().trim();

        if (self.userInput().trim().length === 0) {
            showToast("Please Enter a Prompt First");
            return;
        }

        lastMessageText = messageText;

        if (self.selectedModel().indexOf("bison") !== -1) {
            await sendPalmMessage(messageText);
            return;
        } else if (self.selectedModel().indexOf("claude") !== -1) {
            await sendClaudeMessage(messageText);
            return;
        }

        self.isPalmEnabled(false);
        self.isClaudeEnabled(false);
        addMessage("user", messageText);

        if (!messageText || messageText === "" || self.isLoading() || self.isGeneratingImage()) {
            return;
        }

        if (messageText.toLowerCase().startsWith("image::")) {
            await sendImagePrompt(messageText);
            return;
        }

        if (messageText.toLowerCase().startsWith("vision::")) {
            await sendVisionPrompt();
            return;
        }

        await sendGPTMessage(messageText);
    };

    // Send Palm message
    async function sendPalmMessage(messageText) {
        self.userInput("");
        userInput.style.height = '30px';
        self.isPalmEnabled(true);
        self.isLoading(true);

        let messageContext;
        if (self.palmMessages.length === 0) {
            self.palmMessages.push({
                content: messageText
            });
            addMessage("user", messageText);
            messageContext = self.palmMessages.slice(0);
        } else {
            addMessage("user", messageText);
            messageContext = [...self.palmMessages, {
                content: messageText
            }];
        }

        const response = await fetchPalmResponse(messageContext);
        self.palmMessages.push({
            content: response
        });
        addMessage("assistant", response);
        self.saveMessages();
        self.scrollToBottom();
        self.isLoading(false);
    }

    // Send Claude message
    async function sendClaudeMessage(messageText) {
        if (messageText.toLowerCase().startsWith("vision::")) {
            addMessage("user", messageText);

            self.claudeMessages.push({
                role: "user",
                content: messageText
            });

            self.isAnalyzingImage(true);

            document.getElementById('imageInput').click();

            self.scrollToBottom();
            return;
        }

        self.userInput("");
        userInput.style.height = '30px';

        self.streamedMessageText("");
        self.isClaudeEnabled(true);
        self.isLoading(true);

        self.claudeMessages.push({
            role: "user",
            content: messageText
        });

        addMessage("user", messageText);

        self.scrollToBottom();

        const response = await streamClaudeResponse(self.claudeMessages.slice(0), self.selectedModel(), self.claudeSliderValue(), updateUI);

        self.claudeMessages.push({
            role: "assistant",
            content: response
        });

        addMessage("assistant", response);

        self.saveMessages();
        self.scrollToBottom();
        self.isLoading(false);
    }

    // Send image prompt
    async function sendImagePrompt(imagePrompt) {
        self.isGeneratingImage(true);
        self.scrollToBottom();
        self.userInput("");
        userInput.style.height = '30px';

        const response = await generateDALLEImage(imagePrompt.toLowerCase().split("image::")[1]);
        let imageURLStrings = `${imagePrompt.toLowerCase().split("image::")[1]} \n\n`;
        for (const image of response.data) {
            imageURLStrings += `![${imagePrompt.toLowerCase().split("image::")[1]}](${image.url}) \n`;
        }

        addMessage('assistant', imageURLStrings);
        self.saveMessages();
        self.scrollToBottom();
        self.isGeneratingImage(false);
    }

    self.visionimageUploadClick = async function () {
        if (self.userInput().trim().length === 0) {
            showToast("Please Enter a Prompt First");
            return;
        }

        self.userInput('vision:: ' + self.userInput());
        await self.sendMessage();
    };

    // Send vision prompt
    async function sendVisionPrompt() {
        self.isAnalyzingImage(true);

        document.getElementById('imageInput').click();

        self.scrollToBottom();

        self.userInput("");

        userInput.style.height = '30px';
    }

    // Send GPT message
    async function sendGPTMessage(messageText) {
        self.scrollToBottom();

        self.userInput('');
        userInput.value = '';
        userInput.style.height = '30px';

        self.streamedMessageText("");
        self.isLoading(true);

        try {
            self.streamedMessageText("");

            let response;

            if (self.isUsingLocalModel()) {

                self.localModelName(localStorage.getItem('localModelName') || '');
                self.localSliderValue(localStorage.getItem('local-attitude') || 50);
                self.localModelEndpoint(localStorage.getItem('localModelEndpoint') || '');

                response = await fetchLocalModelResponseStream(self.messages(), self.localSliderValue(), self.localModelName(), self.localModelEndpoint(), updateUI);
            }
            else {
                response = await fetchGPTResponseStream(self.messages(), self.sliderValue(), self.selectedModel(), updateUI);
            }

            self.isLoading(false);

            addMessage('assistant', response);

            self.saveMessages();

            self.scrollToBottom();
        } catch (error) {
            console.error("Error sending message:", error);
        }
    }

    /**
     * Saves the current messages to the selected conversation or creates a new conversation if auto-save is enabled.
     *@async
    * @function saveMessages
    * @memberof self
    * @returns {Promise<void>}
    *
    * @description
    * The function performs the following steps:
    * 1. Maps the current messages to an array of objects containing only the 'role' and 'content' properties.
    * 2. Retrieves the selected conversation from the 'selectedConversation' observable.
    * 3. Finds the index of the selected conversation in the 'storedConversations' array.
    * 4. If the selected conversation is found (index !== -1):
    *    - Updates the 'messageHistory' property of the corresponding conversation in 'storedConversations' with the saved messages.
    * 5. If the selected conversation is not found and the auto-save option is enabled:
    *    - Calls the 'saveNewConversations' function to create a new conversation with the current messages.
    * 6. Saves the updated 'storedConversations' array to the local storage with the key "gpt-conversations".
    */
    self.saveMessages = async function () {
        const savedMessages = self.messages().map(({
            role,
            content
        }) => ({
            role,
            content
        }));

        const selectedConversation = self.selectedConversation();
        const conversationIndex = selectedConversation ?
            self.storedConversations().findIndex(
                (conversation) => conversation.conversation.title === selectedConversation.title
            ) :
            -1;

        if (conversationIndex !== -1) {
            self.storedConversations()[conversationIndex].conversation.messageHistory = savedMessages;
        } else if (JSON.parse(self.selectedAutoSaveOption())) {
            await this.saveNewConversations();
        }

        localStorage.setItem("gpt-conversations", JSON.stringify(self.storedConversations()));
    };

    const defaults = {
        html: true,
        xhtmlOut: false,
        breaks: false,
        langPrefix: 'language-',
        linkify: true,
        typographer: true,
        _highlight: true,
        _strict: false,
        _view: 'src'
    };

    defaults.highlight = function (str, lang) {
        const md = window.markdownit(defaults);
        var esc = md.utils.escapeHtml;
        if (lang && hljs.getLanguage(lang)) {
            try {
                return '<pre class="hljs"><code>' +
                    hljs.highlight(lang, str, true).value +
                    '</code></pre>';
            } catch (__) {}
        } else {
            return '<pre class="hljs"><code>' + esc(str) + '</code></pre>';
        }
    };

    self.formatMessage = function (message, isStartup) {
        let md = window.markdownit(defaults);
        let renderedMessage = wrapCodeSnippets(md.render(message));
        return renderedMessage;
    };

    /**
     * Saves a new conversation or updates an existing one.
     *
     * @async
     * @function saveNewConversations
     * @memberof self
     * @returns {Promise<void>}
     ** @description
     * The function performs the following steps:
     * 1. Creates a new conversation with a title using reateNewConversationWith()
     * 2. Retrieves the stored conversations from local storage or initializes an empty array.
     * 3. If there are no stored conversations, adds the new conversation with an ID of 0 and updates the last loaded conversation ID.
     * 4. If there are stored conversations:
     *    - Sets the conversation ID of the new conversation to the length of stored conversations minus 1.
     *    - If there is a last loaded conversation ID, finds the corresponding conversation and updates its message history.
     *    - If there is no last loaded conversation ID, assigns a new ID to the new conversation and adds it to the stored conversations.
     * 5. Saves the updated stored conversations and the last loaded conversation ID to local storage.
     * 6. Updates the conversations and storedConversations observables with the loaded conversation titles and stored conversations.
     * 7. Sets the selected conversation to the newly created conversation and loads it.
     */
    self.saveNewConversations = async function () {
        const newConversationWithTitle = await createNewConversationWithTitle();

        const storedConversations = localStorage.getItem("gpt-conversations") ?
            JSON.parse(localStorage.getItem("gpt-conversations")) : [];

        if (storedConversations.length === 0) {
            storedConversations.push({
                id: 0,
                conversation: newConversationWithTitle
            });
            localStorage.setItem("lastConversationId", "0");
            self.lastLoadedConversationId(0);
        } else {
            newConversationWithTitle.conversationId = storedConversations.length - 1;

            if (self.lastLoadedConversationId() !== null) {
                const conversationIndex = storedConversations.findIndex(
                    conversation => conversation.id === parseInt(self.lastLoadedConversationId())
                );
                storedConversations[conversationIndex].conversation.messageHistory = newConversationWithTitle.messageHistory;
            } else {
                const highestId = Math.max(...storedConversations.map(conversation => conversation.id));
                storedConversations.push({
                    id: highestId + 1,
                    conversation: newConversationWithTitle
                });
                self.lastLoadedConversationId(highestId + 1);
            }
        }

        localStorage.setItem("gpt-conversations", JSON.stringify(storedConversations));
        localStorage.setItem("lastConversationId", self.lastLoadedConversationId());

        self.conversations(loadConversationTitles());
        self.storedConversations(loadStoredConversations());

        self.selectedConversation(self.conversations()[self.conversations().length - 1]);
        self.loadSelectedConversation();
    };

    self.copyText = function (text) {
        const textarea = document.createElement('textarea');
        textarea.value = text.content;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            console.log('Content copied to clipboard');
        } catch (error) {
            console.error('Failed to copy content: ', error);
        }

        document.body.removeChild(textarea);

        showToast("Copied message text");
    }

    /**
     * Clears the current messages and creates a new conversation or updates an existing one.
     *
     * @async
     * @function clearMessages
     * @memberof self
     * @returns {Promise<void>}
     *
     * @description
     * The function performs the following steps:
     * 1. Sets the processing state to true.
     * 2. Creates a new conversation object with the current message history and an empty title.
     * 3. Retrieves the stored conversations using getStoredConversations()
     * 4. If there are no stored conversations, creates and stores a new conversation using createAndStoreNewConversation()
     * 5. If there are stored conversations:
     *    - Sets the conversation ID of the new conversation to the length of stored conversations minus 1.
     *    - If auto-save is selected and there is a last loaded conversation ID, updates the existing conversation using updateExistingConversation()
     *    - Otherwise, creates and stores a new conversation using createAndStoreNewConversation()
     * 6. Saves the updated stored conversations to local storage and sets the last loaded conversation ID to null.
     * 7. Updates the conversations and storedConversations observables with the loaded conversation titles and stored conversations.
     * 8. Resets the messages using resetMessages()
     * 9. Sets the selected conversation to a placeholder object with an empty message history and title.
     * 10. Sets the processing state to false.
     */
    self.clearMessages = async function () {
        self.isProcessing(true);

        const newConversation = {
            messageHistory: self.messages().slice(0),
            title: ""
        };

        const storedConversations = getStoredConversations();

        if (storedConversations.length === 0) {
            await createAndStoreNewConversation(storedConversations, newConversation);
        } else {
            newConversation.conversationId = storedConversations.length - 1;

            if (self.selectedAutoSaveOption() && self.lastLoadedConversationId() !== null) {
                updateExistingConversation(storedConversations, newConversation);
            } else {
                await createAndStoreNewConversation(storedConversations, newConversation);
            }
        }

        localStorage.setItem("gpt-conversations", JSON.stringify(storedConversations));
        localStorage.setItem("lastConversationId", null);

        self.conversations(loadConversationTitles());
        self.storedConversations(loadStoredConversations());
        resetMessages();
        self.selectedConversation({
            messageHistory: [],
            title: 'placeholder'
        });

        self.isProcessing(false);

        showToast("Conversation Saved");
    };

    function getStoredConversations() {
        return localStorage.getItem("gpt-conversations") ?
            JSON.parse(localStorage.getItem("gpt-conversations")) : [];
    }

    async function createAndStoreNewConversation(storedConversations, newConversation) {
        const newConversationWithTitle = await createNewConversationWithTitle();
        const highestId = storedConversations.length > 0 ?
            Math.max(...storedConversations.map(conversation => conversation.id)) :
            -1;
        storedConversations.push({
            id: highestId + 1,
            conversation: newConversationWithTitle
        });
        localStorage.setItem("lastConversationId", (highestId + 1).toString());
        self.lastLoadedConversationId(highestId + 1);
    }

    function updateExistingConversation(storedConversations, newConversation) {
        const conversationIndex = storedConversations.findIndex(
            conversation => conversation.id === parseInt(self.lastLoadedConversationId())
        );
        storedConversations[conversationIndex].conversation.messageHistory = newConversation.messageHistory;
    }
    async function createNewConversationWithTitle() {
        const newConversationWithTitle = {
            messageHistory: self.messages().slice(0),
            title: ""
        };

        if (self.isPalmEnabled()) {
            newConversationWithTitle.title = await fetchPalmConversationTitle(self.palmMessages.slice(0));
        } else if (self.isClaudeEnabled()) {
            newConversationWithTitle.title = await fetchClaudeConversationTitle(self.claudeMessages.slice(0));
        } else {
            newConversationWithTitle.title = await getConversationTitleFromGPT(self.messages().slice(0), self.selectedModel(), self.sliderValue());
        }

        return newConversationWithTitle;
    }

    function resetMessages() {
        localStorage.removeItem("gpt-messages");
        self.messages([]);
        self.claudeMessages = [];
        self.palmMessages = [];
        self.lastLoadedConversationId(null);
    }

    self.scrollToBottom = function () {
        // Smooth scrolling
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth',
        });

        // Fallback to ensure the container is scrolled to the bottom
        setTimeout(() => {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
            });
        }, 500); // Adjust the timeout duration as needed

        self.updateScrollButtonVisibility();
    };

    self.openFileSelector = function () {
        document.getElementById('fileUpload').click();
    }

    self.uploadFile = function (element, event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const contents = e.target.result;

            try {
                const parsedContents = JSON.parse(contents);

                if (!parsedContents.some(item => item.id)) {
                    console.log("Invalid file format");
                    return;
                }

                localStorage.setItem("gpt-conversations", contents);
                self.conversations(loadConversationTitles());
                self.storedConversations(loadStoredConversations());

                const lastConversationIndex = self.conversations().length - 1;
                self.selectedConversation(self.conversations()[lastConversationIndex]);
                self.loadSelectedConversation();

                self.showConversationOptions(true);
            } catch (err) {
                console.log("Bad file detected");
            }
        };

        reader.readAsText(file);
    };

    self.importConversationsClick = function () {
        self.openFileSelector();
    }

    self.exportConversationsClick = function () {
        self.downloadConversations("conversations.json", localStorage.getItem("gpt-conversations"))
    }

    self.downloadConversations = function (filename, text) {
        let element = document.createElement('a');

        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);

        element.click();

        document.body.removeChild(element);
    }

    self.deleteAllConversationsClick = function () {
        localStorage.setItem("gpt-conversations", "");
        self.messages([]);
        self.palmMessages = [];
        self.claudeMessages = [];
        self.conversations([]);
        self.storedConversations([]);
        showToast("All Conversations Deleted.");
    }

    const hasConversations = self.conversations().length > 0;
    const lastConversationId = localStorage.getItem("lastConversationId");

    if (hasConversations) {
        if (lastConversationId !== "null") {
            self.lastLoadedConversationId(lastConversationId);
            const conversationIndex = self.conversations().findIndex(
                (conversation) => conversation.id === parseInt(lastConversationId)
            );
            selectConversation(conversationIndex);
        } else {
            selectConversation(0);
        }
    }

    function selectConversation(index) {
        self.selectedConversation(self.conversations()[index].conversation);
        self.loadSelectedConversation();
    }
}