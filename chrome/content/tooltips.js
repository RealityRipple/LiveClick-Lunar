Cu.import("resource://liveclick/liveplaces.jsm");
Cu.import("resource://liveclick/prefs.jsm");
Cu.import("resource://liveclick/remote.jsm");

if (typeof(LiveClickChrome) == "undefined")
{
	var LiveClickChrome = {};
}

LiveClickChrome.Tooltips =
{
	_tipElement : null,
	_requestId : null,

	showBookmark : function (aTipElement)
	{
		let node = aTipElement._placesNode;
		return this.showItemTooltip(aTipElement, node);
	},

	showSidebar : function (aDocument, aEvent)
	{
		let bTooltips = LiveClickPrefs.getValue("showItemTooltips");

		if (bTooltips && aDocument.tooltipNode.localName == "treechildren")
		{
			let tree = aDocument.tooltipNode.parentNode;
			let row = {}, column = {};
			let tbo = tree.treeBoxObject;
			tbo.getCellAt(aEvent.clientX, aEvent.clientY, row, column, {});
			if (row.value == -1)
				return false;

			let node = tree.view.nodeForTreeIndex(row.value);
			if (LiveClickPlaces.getType(node.parentId) == 1)
			{
				document.getElementById("bhTooltipTextBox").setAttribute("collapsed", "true");
				document.getElementById("liveclick-lit").setAttribute("collapsed", "false");
				return this.showItemTooltip(aDocument.tooltipNode, node);
			}
		}

		return window.top.BookmarksEventHandler.fillInBHTooltip(aDocument, aEvent);
	},

	// Display tooltip for live bookmark item
	showItemTooltip : function (aTipElement, aNode)
	{
		this._tipElement = aTipElement;
		this._requestId = aNode.pageId;

		// Use child text node so title can wrap if too long
		let sTitle = PlacesUIUtils.getBestTitle(aNode);
		let textTitle = document.getElementById("liveclick-lit-title");
		if (textTitle.hasChildNodes())
			textTitle.removeChild(textTitle.firstChild);
		textTitle.appendChild(document.createTextNode(sTitle));

		let rowExpanded = document.getElementById("liveclick-lit-expanded");

		// Set tooltiptext attribute so [Ext] Diigo doesn't suppress tooltip
		aTipElement.setAttribute("tooltiptext", sTitle);

		// Hide expanded tooltip by default
		rowExpanded.setAttribute("collapsed", "true");

		// Stop here if item previews disabled
		if (!LiveClickPrefs.getValue("showItemTooltips"))
			return true;

		let sPreview = LiveClickRemote.getPagePreview(this._requestId);
		// Stop here if preview blank or same as title
		if (sPreview == "" || sPreview == sTitle)
			return true;

		// Use child text node so preview can wrap if too long
		let textPreview = document.getElementById("liveclick-lit-preview");
		if (textPreview.hasChildNodes())
			textPreview.removeChild(textPreview.firstChild);
		textPreview.appendChild(document.createTextNode(sPreview));

		// Show parent icon if available, otherwise use default icon
		let imageFavicon = document.getElementById("liveclick-lit-favicon");
		let sIconURL = "chrome://liveclick/skin/item-normal.png";
		let sIconData = LiveClickPlaces.getPlace(aNode.parentId).icondata;
		if (sIconData) sIconURL = sIconData;
		imageFavicon.setAttribute("src", sIconURL);

		// Show tooltip
		document.getElementById("liveclick-lit-expanded").setAttribute("collapsed", "false");
		return true;
	},

	hideBookmark : function ()
	{
		this.hideItemTooltip();
	},

	hideSidebar : function ()
	{
		document.getElementById("bhTooltipTextBox").setAttribute("collapsed", "false");
		document.getElementById("liveclick-lit").setAttribute("collapsed", "true");
		this.hideItemTooltip();
	},

	hideItemTooltip : function ()
	{
		if (!this._tipElement) return;

		// Stop here if item previews disabled
		if (!LiveClickPrefs.getValue("showItemTooltips")) return;

		// Remove tooltiptext attribute, otherwise preview may not show on next attempt
		//	Do before preview tests
		this._tipElement.removeAttribute("tooltiptext");

		let iOnPreview = LiveClickPrefs.getValue("itemPreview");
		if (iOnPreview == 0) return;

		let sOld = LiveClickPlaces.getPageState(this._requestId);
		let sNew = sOld;

		// Mark item as unread if fresh
		if (iOnPreview == 1 && (sOld == "fresh" || sOld == "new"))
			sNew = "unread";
		// Mark item as read
		else if (iOnPreview == 2)
			sNew = "read";

		if (sNew != sOld) LiveClickPlaces.markPage(this._requestId, sNew);
	}
}