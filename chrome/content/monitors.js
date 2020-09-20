if (typeof(LiveClickChrome) == "undefined")
{
	var LiveClickChrome = {};
}

// LiveClick monitors overlay class
LiveClickChrome.Monitors =
{
	strings : null,

	// Trigger monitors if monitored live bookmark has new items
	monitor : function (aLivemarkId)
	{
		let livemark = LiveClickPlaces.getPlace(aLivemarkId);

		if (!LiveClickPrefs.getValue("monitorAll")
			&& livemark.getToken("monitored", 0) == 0)
			return;

		let iMonitor = livemark.getToken("custom_monitor", LiveClickPrefs.getValue("monitorAction"));

		// No applicable action; break here
		if (iMonitor == 0 || (iMonitor != 1 && livemark.getState() == "fresh"))
			return;

		// Check repeat action for alerts
		//	0 => Never repeat alerts
		//	1 => Repeat every time feed is checked
		//	2 => Repeat once per Firefox session
		let iRepeat = LiveClickPrefs.getValue("alertRepeat");

		LiveClickPlaces.getItems(aLivemarkId,
			function (aItems)
			{
				let items = [];
				for (let i = 0; i < aItems.length; i++)
				{
					if (aItems[i].state == "new")
						items.push(aItems[i]);
					else if (iMonitor == 1 && aItems[i].state == "fresh")
					{
						if (iRepeat == 1 || (iRepeat == 2 && !livemark.alerted))
							items.push(aItems[i]);
					}
				}

				// Break here if array is empty
				if (items.length == 0) return;

				// Perform monitor action
				//  1 => Show alert message (default)
				//  2 => Autoload new items
				//  3 => Smart tag new items
				switch (iMonitor)
				{
					case 1:
						LiveClickChrome.Alerter.addAlert(aLivemarkId, items);
						break;
					case 2:
						LiveClickChrome.Autoloader.processNew(aLivemarkId, items);
						break;
					case 3:
						LiveClickChrome.LiveTagger.processNew(aLivemarkId, items);
						break;
				}
			}
		);
	},

	getString : function (aStringName)
	{
		if (!this.strings)
			this.strings = document.getElementById("liveclick-strings");
		return this.strings.getString(aStringName);
	}
}

// LiveClick Alerter object
LiveClickChrome.Alerter =
{
	_queue : [],
	_livemarks : {},
	_alertVisible : false,
	_currentId : null,

	addAlert : function (aLivemarkId, aNewItems)
	{
		let bExists = this._livemarks["id:"+aLivemarkId];
		this._livemarks["id:"+aLivemarkId] = aNewItems;
		if (!bExists) this._queue.push(aLivemarkId);

		if (!this._alertVisible)
			this.showAlerts();
	},

	showAlerts : function ()
	{
		if (this._alertVisible
			|| !this._queue
			|| this._queue.length == 0) return;

		let iLivemarkId = this._queue.shift();
		let livemark = LiveClickPlaces.getPlace(iLivemarkId);
		let items = this._livemarks["id:"+iLivemarkId];

		this._alertVisible = true;
		this._currentId = iLivemarkId;

		let sAlert = livemark.title != "" ? livemark.title + " " : "";
		sAlert = sAlert + "(" + items.length.toString() + ")";

		Cc["@mozilla.org/alerts-service;1"]
			.getService(Ci.nsIAlertsService)
			.showAlertNotification(
				"chrome://liveclick/content/icons/alert.png",
				LiveClickChrome.Monitors.getString("alertNewItems"),
				sAlert, true, "", this, "");

		// Avoid repeating alert if set to persist only once per session
		livemark.alerted = true;
	},

	observe : function (aSubject, aTopic, aData)
	{
		if (aTopic == "alertclickcallback")
			this.onAlertClickCallback();
		else if (aTopic == "alertfinished")
			this.onAlertFinished();
	},

	onAlertClickCallback : function ()
	{
		let iLivemarkId = this._currentId;
		let livemark = LiveClickPlaces.getPlace(iLivemarkId);
		let items = this._livemarks["id:"+iLivemarkId];
		let iCount = items.length;

		let iAction = iCount == 1 ?
				LiveClickPrefs.getValue("alert1Action") : LiveClickPrefs.getValue("alertNAction");
		//  0 => Do Nothing (May still want to mark as read, so don't just quit)
		//  1 => Open location in new tab
		//  2 => Open feed in new tab
		//  3 => Open newest item in new tab
		//  4 => Open all new items in tab(s)

		// Open feed if unable to open location
		let site;
		if (iAction == 1)
		{
			site = livemark.siteURI;
			if (!site) iAction = 2;
		}

		let iMonitor = LiveClickPrefs.getValue("monitorAction");

		// Switch to appropriate autoloaded tab or open in new tab
		if (iMonitor == 2)
		{
			let sURL;
			switch (iAction)
			{
				case 1:
					sURL = site.spec;
					break;
				case 2:
					sURL = livemark.feedURI.spec;
					break;
				case 3:
				case 4:
					sURL = items[0].url;
					break;
			}

			LiveClickChrome.Utils.reuseOrOpenURL(sURL);
		}
		// Default alert rules
		else
		{
			let sWhereToOpen = LiveClickPrefs.getValue("alertForeground") ?
								"tab" : "tabshifted";

			switch (iAction)
			{
				case 1:
					LiveClickChrome.Utils.openURL(site.spec, null, sWhereToOpen);
					break;
				case 2:
					let sFeed = livemark.feedURI.spec;
					LiveClickChrome.Utils.openFeed(sFeed, null, sWhereToOpen);
					break;
				case 3:
					// Note: Ignores foreground preference (always opens shifted)
					LiveClickChrome.Utils.openPages([items[0].id]);
					break;
				case 4:
					let itemIds = [];
					for (let i = 0; i < items.length; i++)
						itemIds.push(items[i].id);
					LiveClickChrome.Utils.openPages(itemIds);
					break;
			}
		}

		// Mark feed as read
		if ((iCount == 1 && LiveClickPrefs.getValue("alert1Read"))
				|| (iCount > 1 && LiveClickPrefs.getValue("alertNRead")))
			LiveClickPlaces.markLivemark(iLivemarkId, "read");

		// Close alert and call next one
		this.closeAlert();
		this.showAlerts();
	},

	onAlertFinished : function ()
	{
		this._alertVisible = false;
		this._livemarks["id:"+this._currentId] = null;
		this._currentId = null;
		this.showAlerts();
	},

	closeAlert : function ()
	{
		if (!this._alertVisible) return;
		let wm = Cc["@mozilla.org/appshell/window-mediator;1"]
					.getService(Ci.nsIWindowMediator);
		let browserEnumerator = wm.getEnumerator("alert:alert");
		if (browserEnumerator.hasMoreElements())
		{
			browserEnumerator.getNext().close();
			this._alertVisible = false;
			this._livemarks["id:"+this._currentId] = null;
			this._currentId = null;
		}
	}
}

// LiveClick Autoloader object
LiveClickChrome.Autoloader =
{
	processNew : function (aLivemarkId, aNewItems)
	{
		let livemark = LiveClickPlaces.getPlace(aLivemarkId);
		let iCount = aNewItems.length;

		let iAction = iCount == 1 ?
			LiveClickPrefs.getValue("autoload1Action") : LiveClickPrefs.getValue("autoloadNAction");
		//  0 => Do Nothing (May still want to mark as read, so don't just quit)
		//  1 => Open location in new tab
		//  2 => Open feed in new tab
		//  3 => Open newest item in new tab
		//  4 => Open all new items in tab(s)

		// Open feed if unable to open location
		let site;
		if (iAction == 1)
		{
			site = livemark.siteURI;
			if (!site) iAction = 2;
		}

		switch (iAction)
		{
			case 1:
				LiveClickChrome.Utils.openURL(site.spec, null, "tabshifted");
				break;
			case 2:
				let sFeed = livemark.feedURI.spec;
				LiveClickChrome.Utils.openFeed(sFeed, null, "tabshifted");
				break;
			case 3:
				LiveClickChrome.Utils.openPages([aNewItems[0].id]);
				break;
			case 4:
				let itemIds = [];
				for (let i = 0; i < aNewItems.length; i++)
					itemIds.push(aNewItems[i].id);
				LiveClickChrome.Utils.openPages(itemIds);
				break;
		}

		// Mark feed as read
		if ((iCount == 1 && LiveClickPrefs.getValue("autoload1Read"))
				|| (iCount > 1 && LiveClickPrefs.getValue("autoloadNRead")))
			LiveClickPlaces.markLivemark(aLivemarkId, "read");

		// Send alert
		if (LiveClickPrefs.getValue("autoloadAlert"))
			LiveClickChrome.Alerter.addAlert(aLivemarkId, aNewItems);
	}
}

// LiveClick LiveTagger object
LiveClickChrome.LiveTagger =
{
	processNew : function (aLivemarkId, aNewItems)
	{
		let iAction = LiveClickPrefs.getValue("liveTagAction");
		let sLabel = LiveClickPrefs.getValue("liveTagLabel");

		for (let i = 0; i < aNewItems.length; i++)
		{
			let uri = PlacesUIUtils.createFixedURI(aNewItems[i].url);
			PlacesUtils.tagging.tagURI(uri, [sLabel]);
		}

		// Send alert
		if (LiveClickPrefs.getValue("liveTagAlert"))
			LiveClickChrome.Alerter.addAlert(aLivemarkId, aNewItems);
	}
}