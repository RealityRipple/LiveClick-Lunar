if (typeof(LiveClickChrome) == "undefined")
{
	var LiveClickChrome = {};
}

// LiveClick places context menu overlay class
LiveClickChrome.ContextMenu =
{
	// Initialization code
	init : function ()
	{
		// Add LiveClick commands to bookmarks context menu
		let cmPlaces = document.getElementById("placesContext");
		if (cmPlaces)
			cmPlaces.addEventListener("popupshowing", this.popupPlace, false);

		let cmPages = document.getElementById("liveclick-items-menu");
		if (cmPages)
			cmPages.addEventListener("popupshowing", this.popupPage, false);
	},

	popupPlace : function (aEvent)
	{
		// Get context menu
		let popup = aEvent.target;

		// Get bookmark whose context menu was called
		let nBookmark = PlacesUIUtils.getViewForNode(document.popupNode).selectedNode;
		if (!nBookmark) return;

		let iItemId = nBookmark.itemId;
		if (!iItemId) return;

		// Livemark context menu commands
		if (LiveClickPlaces.getType(iItemId) == 1)
		{
			let sState = LiveClickPlaces.getPlace(iItemId).getState();

			let siteURI = LiveClickPlaces.getPlace(iItemId).siteURI;
			let nOpen = popup.getElementsByAttribute("id", "liveclick-pcm-open")[0];
			if (siteURI)
				nOpen.setAttribute("siteURI", siteURI.spec);
			else
				nOpen.removeAttribute("siteURI");

			let feedURI = LiveClickPlaces.getPlace(iItemId).feedURI;
			let nFeed = popup.getElementsByAttribute("id", "liveclick-pcm-feed")[0];
			if (feedURI)
				nFeed.setAttribute("feedURI", feedURI.spec);
			else
				nFeed.removeAttribute("feedURI");

			let nGroup;

			nGroup = popup.getElementsByAttribute("id", "liveclick-pcm-groupunread")[0];
			nGroup.setAttribute("livemarkId", iItemId);
			nGroup.setAttribute("disabled", sState == "read" ? "true" : "false");

			nGroup = popup.getElementsByAttribute("id", "liveclick-pcm-groupnew")[0];
			nGroup.setAttribute("livemarkId", iItemId);
			nGroup.setAttribute("hidden", sState != "new" && sState != "fresh" ? "true" : "false");

			let nMark;

			nMark = popup.getElementsByAttribute("id", "liveclick-pcm-markFeedRead")[0];
			nMark.setAttribute("livemarkId", iItemId);
			nMark.setAttribute("disabled", sState == "read" ? "true" : "false");

			nMark = popup.getElementsByAttribute("id", "liveclick-pcm-markFeedUnread")[0];
			nMark.setAttribute("livemarkId", iItemId);
			nMark.setAttribute("disabled", sState == "unread" ? "true" : "false");

			nMark = popup.getElementsByAttribute("id", "liveclick-pcm-resetnewcount")[0];
			nMark.setAttribute("livemarkId", iItemId);
			nMark.setAttribute("hidden", sState != "new" && sState != "fresh" ? "true" : "false");

			let nReload;
			nReload = popup.getElementsByAttribute("id", "placesContext_reload")[0];
			nReload.setAttribute("livemarkId", iItemId);
			if (LiveClickPrefs.getValue("debug"))
			{
				let sExpires = "";
				if (LiveClickPrefs.getValue("checkAutomatic") && !LiveClick.isSuspended)
				{
					let dtExpire = LiveClickPlaces.getPlace(iItemId).getToken("expiration", 0);
					let iExpire = Math.max(Math.ceil((dtExpire-Date.now())/60000), 0);
					sExpires = iExpire + " mins";
				}
				else
					sExpires = "Suspended";
				nReload.setAttribute("label", "Reload (Next Check: "+sExpires+")");
			}

			let nMonitor;
			nMonitor = popup.getElementsByAttribute("id", "liveclick-pcm-toggleMonitor")[0];
			nMonitor.setAttribute("livemarkId", iItemId);
			nMonitor.setAttribute("checked",
				LiveClickPlaces.getPlace(iItemId).getToken("monitored", 0) > 0 ? "true" : "false");
			nMonitor.setAttribute("hidden",
				LiveClickPrefs.getValue("monitorAll") ? "true" : "false");
		}
		// Folder context menu commands
		else if (LiveClickPlaces.getType(iItemId) == 2)
		{
			let nFolder;

			nFolder = popup.getElementsByAttribute("id", "liveclick-pcm-folderUnread")[0];
			nFolder.setAttribute("folderId", iItemId);

			nFolder = popup.getElementsByAttribute("id", "liveclick-pcm-folderFresh")[0];
			nFolder.setAttribute("folderId", iItemId);

			let nReload = popup.getElementsByAttribute("id", "liveclick-pcm-reload")[0];
			nReload.setAttribute("folderId", iItemId);
		}
	},

	popupPage : function (aEvent)
	{
		// Get context menu
		let popup = aEvent.target;

		// Get item whose context menu was called
		let nItem = document.popupNode._placesNode;
		if (!nItem) return;

		// Livemark item context menu commands
		if (nItem.pageId)
		{
			let nOpen = popup.getElementsByAttribute("id", "liveclick-pcm-openItem")[0];
			nOpen.setAttribute("uri", nItem.uri);

			let nOpenTab = popup.getElementsByAttribute("id", "liveclick-pcm-openItemTab")[0];
			nOpenTab.setAttribute("uri", nItem.uri);

			let iPageId = nItem.pageId;
			LiveClickPlaces.getPageState(iPageId,
				(function (sState)
				{
					let nRead = popup.getElementsByAttribute("id", "liveclick-pcm-markRead")[0];
					nRead.setAttribute("pageId", iPageId);
					nRead.setAttribute("disabled", sState == "read" ? "true" : "false");

					let nUnread = popup.getElementsByAttribute("id", "liveclick-pcm-markUnread")[0];
					nUnread.setAttribute("pageId", iPageId);
					nUnread.setAttribute("disabled", sState == "unread" ? "true" : "false");
				})
			);
		}
	}
}

window.addEventListener("load", function() { LiveClickChrome.ContextMenu.init(); }, false);