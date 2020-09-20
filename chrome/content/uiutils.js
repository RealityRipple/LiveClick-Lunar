if (typeof(LiveClickChrome) == "undefined")
{
	var LiveClickChrome = {};
}

// LiveClick chrome utils overlay
LiveClickChrome.Utils =
{
	// Open URL
	openURL : function (aURL, aEvent, aWhereToOpen)
	{
		if (aURL == "") return;

		if (!aWhereToOpen || aWhereToOpen == "")
			openUILink(aURL, aEvent);
		else
			openUILinkIn(aURL, aWhereToOpen);
	},

	// Open feed link
	openFeed : function (aURL, aEvent, aWhereToOpen)
	{
		if (aURL == "") return;

		// TODO: Temporarily override default feed handling to allow feed page view
		//	Commented code throws an uncatchable exception
		/*
		let feedService = Cc["@mozilla.org/browser/feeds/result-service;1"]
							.getService(Ci.nsIFeedResultService);
		feedService.forcePreviewPage = true;
		*/

		this.openURL(aURL, aEvent, aWhereToOpen);
	},

	// Open list of items in background (input array of page ids)
	openPages : function (aPages)
	{
		let iCount = aPages.length;

		// Prompt before opening too many new tabs
		if (!PlacesUIUtils._confirmOpenInTabs(iCount)) return;

		for (let i = 0; i < iCount; i++)
		{
			// Mark live bookmark item as read
			//	Do now, because history may not catch visit, e.g. FeedBurner
			LiveClickPlaces.markPage(aPages[i], "read");
			LiveClickPlaces.getPageURL(aPages[i],
				(function (sURL)
				{
					this.openURL(sURL, null, "tabshifted");
				}).bind(this)
			);
		}
	},

	// Open all items of a given state in livemarks of a given folder
	openFolderItems : function (aFolderId, aState)
	{
		let livemarks = [];
		let contents = PlacesUtils.getFolderContents(aFolderId, false, false).root;
		contents.containerOpen = true;
		for (let i = 0; i < contents.childCount; i++)
		{
			let child = contents.getChild(i);
			if (LiveClickPlaces.getType(child.itemId) == 1)
				livemarks.push(child.itemId);
		}
		contents.containerOpen = false;

		let pages = [], iDone = 0;
		for (let i = 0; i < livemarks.length; i++)
		{
			LiveClickPlaces.getItems(livemarks[i],
				(function (aItems)
				{
					for (let i = 0; i < aItems.length; i++)
					{
						let sState = aItems[i].state;
						if ((aState == "")
								|| (aState == "unseen" && (sState == "new" || sState == "fresh"))
								|| (aState == "unread"
										&& (sState == "new" || sState == "fresh" || sState == "unread" || sState == "unknown"))
								|| (aState == sState))
							pages.push(aItems[i].id);
					}
					iDone++;
					if (iDone == livemarks.length && pages.length > 0)
						this.openPages(pages);
				}).bind(this)
			);
		}
	},

	// Open livemark group
	openGroup : function (aLivemarkId, aState)
	{
		LiveClickPlaces.getItems(aLivemarkId,
			(function (aItems)
			{
				let pages = [];
				for (let i = 0; i < aItems.length; i++)
				{
					let sState = aItems[i].state;
					if ((aState == "")
							|| (aState == "unseen" && (sState == "new" || sState == "fresh"))
							|| (aState == "unread"
									&& (sState == "new" || sState == "fresh" || sState == "unread" || sState == "unknown"))
							|| (aState == sState))
						pages.push(aItems[i].id);
				}
				if (pages.length > 0) this.openPages(pages);
			}).bind(this)
		);
	},

	// http://developer.mozilla.org/en/docs/Code_snippets:Tabbed_browser#Reusing_by_URL.2FURI
	reuseOrOpenURL : function (aURL)
	{
		let wm = Cc["@mozilla.org/appshell/window-mediator;1"]
					.getService(Ci.nsIWindowMediator);
		let browserEnumerator = wm.getEnumerator("navigator:browser");

		// Check each browser instance for our URL
		let found = false;
		while (!found && browserEnumerator.hasMoreElements())
		{
			let browserInstance = browserEnumerator.getNext().getBrowser();

			// Check each tab of this browser instance
			// Go backwards (assume recent tabs are at the end)
			let numTabs = browserInstance.tabContainer.childNodes.length;
			for (let index = numTabs - 1; index >= 0; index--)
			{
				let currentBrowser = browserInstance.getBrowserAtIndex(index);
				if (aURL == currentBrowser.currentURI.spec)
				{
					// The URL is already opened. Select this tab.
					browserInstance.selectedTab = browserInstance.tabContainer.childNodes[index];

					// Focus *this* browser
					browserInstance.focus();
					found = true;
					break;
				}
			}
		}

		// Our URL isn't open. Open it now.
		if (!found)
		{
			let recentWindow = wm.getMostRecentWindow("navigator:browser");
			// Use an existing browser window
			if (recentWindow)
				this.openURL(aURL, null, "tabshifted");
			// No browser windows are open, so open a new one.
			else
				window.open(aURL);
		}
	},

	// Open Options dialog
	//	http://mxr.mozilla.org/mozilla/source/browser/base/content/utilityOverlay.js#395
	openOptions : function()
	{
		// Focus on dialog if already open
		let wm = Cc["@mozilla.org/appshell/window-mediator;1"]
					.getService(Ci.nsIWindowMediator);
		let win = wm.getMostRecentWindow("LiveClick:PrefWindow");
		if (win)
		{
			win.focus();
			return win;
		}
		// Otherwise open new dialog (nonmodal if Mac)
		else
		{
			// Retrieving instantApply preference here, not altering it
			let bApply = Preferences.get("browser.preferences.instantApply", false);
			let sModal = bApply ? "dialog=no" : "modal";

			let dialogURL = "chrome://liveclick/content/options.xul";
			let features = "chrome,titlebar,toolbar,centerscreen," + sModal;

			return openDialog(dialogURL, "LiveClickPrefs", features);
		}
	}
}