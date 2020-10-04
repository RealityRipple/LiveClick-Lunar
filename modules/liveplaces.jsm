var EXPORTED_SYMBOLS = [ "LiveClickPlaces" ];
const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
// Import Firefox modules
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils", "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NetUtil", "resource://gre/modules/NetUtil.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUIUtils", "resource:///modules/PlacesUIUtils.jsm");
Cu.import("resource://liveclick/prefs.jsm");
Cu.import("resource://liveclick/remote.jsm");
if (typeof(LiveClickPlaces) == "undefined")
{
 var LiveClickPlaces =
 {
  places : {},
  _isInitialized : false,
  _initTimer : null,
  isChecking : false,
  _checkTimer : null,
  _queue : [],
  loading : [],
  done : [],
  init : function ()
  {
   LiveClickRemote.init();
   // Observe bookmarks changes to update counts when livemarks created, moved, or deleted
   PlacesUtils.bookmarks.addObserver(UberObserver, false);
   // Observe history changes to mark items/live bookmarks on visits
   PlacesUtils.history.addObserver(UberObserver, false);
   // Repeat call to initPlaces until initializing complete
   let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
   timer.initWithCallback(LiveClickPlaces.initPlaces, 1500, Ci.nsITimer.TYPE_REPEATING_SLACK);
   LiveClickPlaces._initTimer = timer;
  },
  shutdown : function ()
  {
   PlacesUtils.bookmarks.removeObserver(UberObserver);
   PlacesUtils.history.removeObserver(UberObserver);
   // Perform exit tasks
   let iOnExit = LiveClickPrefs.getValue("browserExit");
   // Clear history; no need to update GUI or clean history
   if (iOnExit == 3)
   {
    LiveClickPlaces.clearHistory(false);
    return;
   }
   if (LiveClickRemote.beginTransaction())
   {
    for (let id in LiveClickPlaces.places)
    {
     let livemark = LiveClickPlaces.places[id];
     if (livemark.type != 1) continue;
     let sState = livemark.getState();
     // Mark all live bookmarks as read
     if (iOnExit == 2)
     {
      LiveClickRemote.changeChildrenStates(livemark.id, "", "read");
     }
     // Mark new/fresh items as unread
     else if (iOnExit == 1 && (sState == "new" || sState == "fresh"))
     {
      LiveClickRemote.changeChildrenStates(livemark.id, "new", "unread");
      LiveClickRemote.changeChildrenStates(livemark.id, "fresh", "unread");
     }
     // Mark new items as fresh
     else if (sState == "new")
     {
      LiveClickRemote.changeChildrenStates(livemark.id, "new", "fresh");
     }
    }
    // Clear out old items
    LiveClickRemote.clearOrphans();
    LiveClickRemote.clearOrphanProxies();
    LiveClickRemote.endTransaction();
   }
  },
  // Separate function to call in case earlier attempts fail
  initPlaces : function ()
  {
   if (LiveClickPlaces._isInitialized) return;
   if (LiveClickPlaces._initTimer)
    LiveClickPlaces._initTimer.cancel();
   let iLivemarks = 0;
   let livemarks = PlacesUtils.annotations
        .getItemsWithAnnotation("livemark/feedURI", {});
   for (let i = 0; i < livemarks.length; i++)
   {
    LiveClickPlaces.initLivemark(livemarks[i]);
    iLivemarks++;
   }
   LiveClickPlaces._isInitialized = iLivemarks > 0;
   logMessage(iLivemarks + " livemarks identified.");
   Cc["@mozilla.org/observer-service;1"]
    .getService(Ci.nsIObserverService)
    .notifyObservers(null, "liveclick-init-complete", 1);
  },
  initLivemark : function (aLivemarkId)
  {
   // Don't need to do anything if already initialized
   if (LiveClickPlaces.places["id:"+aLivemarkId]) return;
   LiveClickPlaces.getItems(aLivemarkId,
    (function (aItems)
    {
     let livemark = new Place(aLivemarkId, 1);
     let counts = new Counts();
     for (let i = 0; i < aItems.length; i++)
      counts[aItems[i].state]++;
     counts.total = aItems.length;
     // Unread count is anything that's not read, fresh, or new
     counts.unread = counts.total - counts.read - counts.fresh - counts.new;
     counts.loaded = true;
     livemark.counts = counts;
     livemark.populated = Date.now();
     LiveClickPlaces.places["id:"+aLivemarkId] = livemark;
     // Initialize parent, update count with livemark state
     let iParentId = LiveClickPlaces.getPlace(aLivemarkId).parentId;
     LiveClickPlaces.initFolder(iParentId);
     LiveClickPlaces.getPlace(iParentId).counts.resizeFolder(livemark.getState(), 1);
     // Broadcast livemark state
     livemark.broadcast();
    }).bind(this)
   );
  },
  initFolder : function (aFolderId)
  {
   // Don't need to do anything if already initialized
   if (LiveClickPlaces.places["id:"+aFolderId]) return;
   LiveClickPlaces.places["id:"+aFolderId] = new Place(aFolderId, 2);
  },
  getPlace : function (aPlaceId)
  {
   if (!this.places["id:"+aPlaceId])
    throw Components.results.NS_ERROR_INVALID_ARG;
   return this.places["id:"+aPlaceId];
  },
  getType : function (aPlaceId)
  {
   if (!this.places["id:"+aPlaceId]) return 0;
   return this.places["id:"+aPlaceId].type;
  },
  removePlace : function (aPlaceId)
  {
   if (!this.places["id:"+aPlaceId]) return 0;
   delete this.places["id:"+aPlaceId];
  },
  getItems : function (aLivemarkId, aCallback)
  {
   LiveClickRemote.getChildren(aLivemarkId, aCallback);
  },
  getPageParent : function (aPageId, aCallback)
  {
   return LiveClickRemote.getPageProperty(aPageId, "parent", aCallback);
  },
  getPageState : function (aPageId, aCallback)
  {
   return LiveClickRemote.getPageProperty(aPageId, "state", aCallback);
  },
  getPageURL : function (aPageId, aCallback)
  {
   return LiveClickRemote.getPageProperty(aPageId, "url", aCallback);
  },
  markAll : function (aState)
  {
   if (LiveClickRemote.beginTransaction())
   {
    for (let id in LiveClickPlaces.places)
    {
     let livemark = LiveClickPlaces.places[id];
     if (livemark.type != 1) continue;
     LiveClickPlaces.markLivemark(livemark.id, aState);
    }
    LiveClickRemote.endTransaction();
   }
  },
  // Mark items within a livemark as read/unread
  markLivemark : function (aLivemarkId, aState)
  {
   let sOld = LiveClickPlaces.getPlace(aLivemarkId).getState();
   let iParentId = LiveClickPlaces.getPlace(aLivemarkId).parentId;
   // We don't want to change read status to unread,
   // so only mark new or fresh items as unread
   if (aState == "seen")
   {
    if (sOld == "new" || sOld == "fresh")
    {
     LiveClickRemote.changeChildrenStates(aLivemarkId, "new", "unread");
     LiveClickRemote.changeChildrenStates(aLivemarkId, "fresh", "unread");
     LiveClickPlaces.getPlace(aLivemarkId).counts.shiftAllFrom("new", "unread");
     LiveClickPlaces.getPlace(aLivemarkId).counts.shiftAllFrom("fresh", "unread");
     LiveClickPlaces.getPlace(iParentId).counts.shiftOne(sOld, "unread");
     LiveClickPlaces.getPlace(aLivemarkId).broadcast();
    }
   }
   // Otherwise mark all items as read/unread
   else if (sOld != aState)
   {
    LiveClickRemote.changeChildrenStates(aLivemarkId, "", aState);
    LiveClickPlaces.getPlace(aLivemarkId).counts.shiftAll(aState);
    LiveClickPlaces.getPlace(iParentId).counts.shiftOne(sOld, aState);
    LiveClickPlaces.getPlace(aLivemarkId).broadcast();
   }
  },
  // Mark single page as read/unread
  markPage : function (aPageId, aState)
  {
   LiveClickPlaces.getPageParent(aPageId,
    (function (iLivemarkId)
    {
     if (LiveClickPlaces.getType(iLivemarkId) != 1) return;
     LiveClickPlaces.getPageState(aPageId,
      (function (sOld)
      {
       if (sOld == aState) return;
       LiveClickRemote.setPageState(aPageId, aState);
       // Remove LiveTag, if necessary
       if (aState == "read" && LiveClickPrefs.getValue("monitorAction") == 3
         && LiveClickPrefs.getValue("liveTagOnRead"))
       {
        let sTag = LiveClickPrefs.getValue("liveTagLabel");
        LiveClickPlaces.getPageURL(aPageId,
         (function (sURL)
         {
          let uri = PlacesUIUtils.createFixedURI(sURL);
          PlacesUtils.tagging.untagURI(uri, [sTag]);
         })
        );
       }
       // Update parent folder counts on feed state change
       if (LiveClickPlaces.getPlace(iLivemarkId).counts.shiftOne(sOld, aState))
       {
        let iParentId = LiveClickPlaces.getPlace(iLivemarkId).parentId;
        LiveClickPlaces.getPlace(iParentId).counts.shiftOne(sOld, aState);
       }
       LiveClickPlaces.getPlace(iLivemarkId).broadcast();
      })
     );
    })
   );
  },
  toggleMonitor : function (aLivemarkId)
  {
   let iMonitor = LiveClickPlaces.getPlace(aLivemarkId).getToken("monitored", 0);
   LiveClickPlaces.getPlace(aLivemarkId).setToken("monitored", (iMonitor+1)%2);
  },
  getNextExpire : function (aCallback)
  {
   return LiveClickRemote.getNextExpire(aCallback);
  },
  clearHistory : function (aBroadcast)
  {
   LiveClickRemote.clearPages([]);
   LiveClickRemote.clearFeedsAnno([], "expiration");
   if (!aBroadcast) return;
   // Broadcast to update GUI manually
   for (let id in LiveClickPlaces.places)
   {
    let livemark = LiveClickPlaces.places[id];
    if (livemark.type != 1) continue;
    livemark.counts.zero();
    // Default folder state is read
    let iParentId = livemark.parentId;
    LiveClickPlaces.getPlace(iParentId).counts.shiftAll("read");
    livemark.broadcast();
   }
  },
  purgeData : function ()
  {
   LiveClickRemote.deletePagesDB();
   LiveClickRemote.purgeLiveClickAnnos();
  },
  checkLivemark : function (aLivemarkId)
  {
   logMessage("Manual check requested (singleton)...");
   LiveClickPlaces.queueUp([aLivemarkId], true);
  },
  checkLivemarkIfExpired : function (aLivemarkId)
  {
   let livemark = LiveClickPlaces.getPlace(aLivemarkId);
   let dtExpires = livemark.getToken("expiration", Date.now());
   if (dtExpires > Date.now()+90000) return;
   // Only queue livemarks that haven't already been queued/checked
   let bQueued = false;
   let jobs = this._queue.concat(this.done);
   for (let i = 0; i < jobs.length; i++)
   {
    if (jobs[i] == aLivemarkId)
    {
     bQueued = true;
     break;
    }
   }
   if (bQueued) return;
   logMessage("Check requested on demand (singleton)...");
   LiveClickPlaces.queueUp([aLivemarkId], true);
   LiveClickRemote.setFeedsAnno([aLivemarkId], "loading");
  },
  checkFolder : function (aFolderId)
  {
   logMessage("Manual check requested (folder)...");
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
   LiveClickPlaces.queueUp(livemarks, true);
  },
  checkAll : function ()
  {
   logMessage("Manual check requested (all)...");
   let livemarks = PlacesUtils.annotations.getItemsWithAnnotation("livemark/feedURI", {});
   LiveClickPlaces.queueUp(livemarks, true);
  },
  checkExpired : function ()
  {
   // Test if a check is already active
   // No need to set new timer as active check will set one when done
   if (LiveClickPlaces.isChecking) return;
   // Check any livemarks that expire within 90s of now
   // Treat livemarks with bad expires (>24hrs) as if they expire now
   let livemarks = [];
   let dtCheckTime = Date.now()+90000;
   for (let id in LiveClickPlaces.places)
   {
    let livemark = LiveClickPlaces.places[id];
    if (livemark.type != 1) continue;
    let dtExpire = livemark.getToken("expiration", Date.now());
    if ((dtExpire < dtCheckTime) || (dtExpire > dtCheckTime+86400000))
     livemarks.push(livemark.id);
   }
   if (livemarks.length > 0)
   {
    logMessage("Checking expired live bookmarks...");
    LiveClickPlaces.queueUp(livemarks, false);
   }
   else
   {
    logMessage("Found no expired live bookmarks to check");
    // Must send notification here to set new automatic timer
    Cc["@mozilla.org/observer-service;1"]
     .getService(Ci.nsIObserverService)
     .notifyObservers(null, "liveclick-checking", false);
   }
  },
  queueUp : function (aLivemarks, aActive)
  {
   if (!aLivemarks.length || aLivemarks.length == 0)
    return;
   function sortByParent (a, b)
   {
    let iParentA = LiveClickPlaces.getPlace(a).parentId;
    let iParentB = LiveClickPlaces.getPlace(b).parentId;
    if (iParentA < iParentB)
     return -1;
    else if (iParentA > iParentB)
     return 1;
    let iIndexA = PlacesUtils.bookmarks.getItemIndex(a);
    let iIndexB = PlacesUtils.bookmarks.getItemIndex(b);
    if (iIndexA < iIndexB)
     return -1;
    else if (iIndexA > iIndexB)
     return 1;
    return 0;
   }
   // Sort livemarks (should this be active only?)
   aLivemarks.sort(sortByParent);
   // Only queue livemarks that aren't already queued
   for (let i = 0; i < aLivemarks.length; i++)
   {
    let bQueued = false;
    for (let j = 0; j < this._queue.length; j++)
    {
     if (aLivemarks[i] == this._queue[j])
     {
      bQueued = true;
      break;
     }
    }
    if (bQueued) continue;
    LiveClickPlaces.getPlace(aLivemarks[i]).createJob();
    this._queue.push(aLivemarks[i]);
   }
   // Do nothing more if already checking
   if (this.isChecking) return;
   // Notify observers of checking state change
   this.isChecking = true;
   Cc["@mozilla.org/observer-service;1"]
    .getService(Ci.nsIObserverService)
    .notifyObservers(null, "liveclick-checking", this.isChecking);
   // Native livemarks service waits 3000ms between checking feeds
   // LiveClick decreases delay on active requests, increases on passive requests
   let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
   timer.initWithCallback(this.processNext, aActive ? 2000 : 5000,
         Ci.nsITimer.TYPE_REPEATING_SLACK);
   this._checkTimer = timer;
   // Fire here to process first in queue without delay
   this.processNext();
  },
  processNext : function ()
  {
   // Cancel timer and reset expirations if queues empty
   if (LiveClickPlaces._queue.length == 0 && LiveClickPlaces.loading.length == 0)
   {
    LiveClickPlaces.stopCheck();
    return;
   }
   // Queue empty, but still loading; keep firing until done loading
   if (LiveClickPlaces._queue.length == 0)
   {
    logMessage("... Waiting on " +LiveClickPlaces.loading.length+" check(s) to complete ...");
    return;
   }
   // Wait until load lightens; no more than 2 check request at a time
   if (LiveClickPlaces.loading.length > 1)
   {
    logMessage("... Waiting on load to lighten (" + LiveClickPlaces.loading.length + ") ...");
    return;
   }
   let iLivemarkId = LiveClickPlaces._queue.shift();
   LiveClickPlaces.getPlace(iLivemarkId).startJob();
  },
  stopCheck : function ()
  {
   // Kill check timer
   if (this._checkTimer)
   {
    this._checkTimer.cancel();
    delete this._checkTimer;
   }
   // Cancel active loading requests
   for (let i = 0; i < this.loading.length; i++)
   {
    let livemark = LiveClickPlaces.getPlace(this.loading[i]);
    if (livemark.job)
    {
     livemark.job.cancel();
     delete livemark.job;
    }
   }
   // Batch remove loading annotations
   LiveClickRemote.clearFeedsAnno([], "loading");
   let iDefault = Math.max(LiveClickPrefs.getValue("defaultInterval"), 1000);
   let data = [];
   for (let i = 0; i < this.done.length; i++)
   {
    let livemark = LiveClickPlaces.getPlace(this.done[i]);
    let dtExpire = livemark.getExpires(iDefault);
    data.push({ id: livemark.id, content: dtExpire, expire: LC_EXPIRE_NEVER });
   }
   // Batch set new expiration times
   LiveClickRemote.setFeedBatch("expiration", data);
   if (this.isChecking && !LiveClickPrefs.getValue("checkAutomatic"))
    logMessage("Done checking");
   // Reset checker
   this._queue = [];
   this.loading = [];
   this.done = [];
   this.isChecking = false;
   // Notify observers of checking state change
   Cc["@mozilla.org/observer-service;1"]
    .getService(Ci.nsIObserverService)
    .notifyObservers(null, "liveclick-checking", this.isChecking);
  }
 }
}
function Place (aPlaceId, aPlaceType)
{
 this.id = aPlaceId;
 this.type = aPlaceType;
 this.title = PlacesUtils.bookmarks.getItemTitle(aPlaceId);
 this.parentId = PlacesUtils.bookmarks.getFolderIdForItem(aPlaceId);
 // Livemark
 if (aPlaceType == 1)
 {
  let sFeedURI = LiveClickRemote.getFeedToken(aPlaceId, "custom_feed");
  if (!sFeedURI) sFeedURI = PlacesUtils.annotations.getItemAnnotation(aPlaceId, "livemark/feedURI");
  this.feedURI = PlacesUIUtils.createFixedURI(sFeedURI);
  let sSiteURI = LiveClickRemote.getFeedToken(aPlaceId, "custom_site");
  if (!sSiteURI)
  {
   try
   {
    sSiteURI = PlacesUtils.annotations.getItemAnnotation(aPlaceId, "livemark/siteURI");
   }
   catch (e) {}
  }
  if (sSiteURI) this.siteURI = PlacesUIUtils.createFixedURI(sSiteURI);
  this.cacheFavicon(false);
 }
 else
 {
  this.counts = new Counts();
 }
}
Place.prototype =
{
 getState : function ()
 {
  // Return unknown state if folder has no livemarks (as opposed to read)
  if (this.type == 2 && this.counts.total == 0)
   return "unknown";
  if (!this.counts.loaded) return "unknown";
  return this.counts.getState();
 },
 setToken : function (aToken, aData)
 {
  // Update local feedURI, siteURI values (and favicon)
  // TODO: Validate URIs?
  if (aToken == "custom_feed")
   this.feedURI = PlacesUIUtils.createFixedURI(aData);
  else if (aToken == "custom_site")
  {
   if (aData != "")
    this.siteURI = PlacesUIUtils.createFixedURI(aData);
   else
    delete this.siteURI;
   this.cacheFavicon(true);
  }
  LiveClickRemote.setFeedToken(this.id, aToken, aData);
 },
 getToken : function (aToken, aDefault)
 {
  let iValue = LiveClickRemote.getFeedToken(this.id, aToken);
  if (iValue != null && typeof aDefault == "number")
   iValue = parseFloat(iValue);
  return iValue != null ? iValue : aDefault;
 },
 getExpires : function (aDefault)
 {
  let iInterval = LiveClickRemote.getFeedToken(this.id, "custom_interval");
  if (!iInterval || iInterval == -1) iInterval = Math.max(aDefault, 1000);
  // expireTime stores as milliseconds
  return Date.now() + (iInterval * 1000);
 },
 cacheFavicon : function (aReload)
 {
  if (aReload)
  {
   this.fetchFaviconData();
   return;
  }
  LiveClickRemote.getIconDataURL(this.id,
   (function (aIconDataURL)
   {
    if (aIconDataURL)
    {
     this.icondata = aIconDataURL;
     this.broadcast();
     return;
    }
    this.fetchFaviconData();
   }).bind(this)
  );
 },
 fetchFaviconData : function ()
 {
  if (!this.siteURI)
  {
   delete this.icondata;
   LiveClickRemote.setIconDataURL(this.id);
   this.broadcast();
   return;
  }
  // False positive: already using newer asyncFavicon service
  PlacesUtils.favicons.getFaviconDataForPage(this.siteURI,
   (function (aIconURI, aDataLen, aData, aMimeType)
   {
    if (aIconURI)
     this.icondata =
      "data:" + aMimeType + ";base64," +
       btoa(String.fromCharCode.apply(null, aData));
    else
     delete this.icondata;
    LiveClickRemote.setIconDataURL(this.id, this.icondata);
    this.broadcast();
   }).bind(this)
  );
 },
 createJob : function ()
 {
  if (this.job) return;
  this.job = new Job();
 },
 startJob : function Place_Check ()
 {
  // Use direct access to database whenever possible to save overhead
  LiveClickRemote.clearFeedsAnno([this.id], "loadfailed");
  // Must use annotation service to set/remove loading and trigger UI update
  PlacesUtils.annotations.setItemAnnotation
   (this.id, "liveclick/loading", true, 0, LC_EXPIRE_NEVER);
  logMessage(". "+this.title);
  try
  {
   /* http://mxr.mozilla.org/mozilla-central/source/toolkit/components/places/nsLivemarkService.js#529 */
   let loadgroup = Cc["@mozilla.org/network/load-group;1"].createInstance(Ci.nsILoadGroup);
   let secMan = Cc["@mozilla.org/scriptsecuritymanager;1"]
    .getService(Ci.nsIScriptSecurityManager);
   let feedPrincipal = secMan.createCodebasePrincipal(this.feedURI, {});
   let channel = NetUtil.newChannel(
    {
     uri: this.feedURI,
     loadingPrincipal: feedPrincipal,
     securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
     contentPolicyType: Ci.nsIContentPolicy.TYPE_INTERNAL_XMLHTTPREQUEST
    }).QueryInterface(Ci.nsIHttpChannel);
   channel.loadGroup = loadgroup;
   channel.loadFlags |= Ci.nsIRequest.LOAD_BACKGROUND | Ci.nsIRequest.LOAD_BYPASS_CACHE;
   channel.requestMethod = "GET";
   channel.setRequestHeader("X-Moz", "livebookmarks", false);
   // Stream the result to the feed parser with this listener
   let listener = new CheckListener(this);
   channel.notificationCallbacks = listener;
   channel.asyncOpen(listener, null);
   this.job.loadgroup = loadgroup;
   LiveClickPlaces.loading.push(this.id);
  }
  catch (e)
  {
   logMessage(e);
   this.finishJob(false);
  }
 },
 finishJob : function (aSuccess)
 {
  // Checking stopped so assume finish tasks already performed
  if (!LiveClickPlaces.isChecking) return;
  // Remove from loading queue
  let iIndex = -1;
  for (let i = 0; i < LiveClickPlaces.loading.length; i++)
  {
   if (LiveClickPlaces.loading[i] != this.id) continue;
   iIndex = i;
   break;
  }
  if (iIndex >= 0) LiveClickPlaces.loading.splice(iIndex, 1);
  if (aSuccess)
  {
   let stateNew = this.getState();
   if (stateNew != this.job.stateOld)
   {
    LiveClickPlaces.getPlace(this.parentId).counts.shiftOne(this.job.stateOld, stateNew);
    // Manually broadcast folder state; otherwise, won't get broadcast
    LiveClickPlaces.getPlace(this.parentId).broadcast();
   }
   if (stateNew == "new" || stateNew == "fresh")
   {
    // Keep track of new population time
    this.populated = Date.now();
    // Alert monitors of new/fresh items
    Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService)
     .notifyObservers(null, "liveclick-monitor", this.id.toString());
   }
  }
  else
  {
   logMessage("*** FAILED *** "+this.title+" ("+this.id+")");
   LiveClickRemote.setFeedsAnno([this.id], "loadfailed");
  }
  // Must use annotation service to set/remove loading and trigger UI update
  PlacesUtils.annotations.removeItemAnnotation(this.id, "liveclick/loading");
  LiveClickPlaces.done.push(this.id);
  // Kill job
  if (!this.job) return;
  this.job.cancel();
  delete this.job;
 },
 broadcast : function ()
 {
  let obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
  // Notify observers of feed state update
  obs.notifyObservers(null, "liveclick-statechange", this.id.toString());
  // Notify observers of parent folder update if livemark
  if (this.type == 2) return;
  obs.notifyObservers(null, "liveclick-statechange", this.parentId.toString());
 }
}
function Job ()
{
 this.loadgroup = null;
 this.processor = null;
}
Job.prototype =
{
 cancel : function ()
 {
  if (this.loadgroup)
  {
   this.loadgroup.cancel(Components.results.NS_BINDING_ABORTED);
   delete this.loadgroup;
  }
  if (this.processor)
  {
   delete this.processor;
  }
 }
}
function CheckListener (aPlace)
{
 this._place = aPlace; // type LiveClickPlace
 this._job = aPlace.job;
}
CheckListener.prototype =
{
 onStartRequest : function (aRequest, aContext)
 {
  let channel = aRequest.QueryInterface(Ci.nsIChannel);
  try
  {
   // Parse feed data as it comes in
   this._job.processor = Cc["@mozilla.org/feed-processor;1"]
         .createInstance(Ci.nsIFeedProcessor);
   this._job.processor.listener = this;
   this._job.processor.parseAsync(null, channel.URI);
   this._job.processor.onStartRequest(aRequest, aContext);
  }
  catch (e)
  {
   Cu.reportError("Livemark Service: feed processor received an invalid channel for " + channel.URI.spec);
   this._place.finishJob(false);
  }
 },
 onDataAvailable : function (aRequest, aContext, aInputStream, aSourceOffset, aCount)
 {
  if (this._job.processor)
   this._job.processor.onDataAvailable
    (aRequest, aContext, aInputStream, aSourceOffset, aCount);
 },
 onStopRequest : function (aRequest, aContext, aStatus)
 {
  if (!Components.isSuccessCode(aStatus))
  {
   this._place.finishJob(false);
   return;
  }
  try
  {
   if (this._job.processor)
    this._job.processor.onStopRequest(aRequest, aContext, aStatus);
  }
  catch (e) { }
 },
 handleResult : function (aResult)
 {
  function getExisting (aCurrent, aURL, aPosition, aTitle, aPreview)
  {
   let iExistingId = -1;
   let bUpdated = false;
   let sState = "unknown";
   let iMatches = 0;
   for (let i = 0; i < aCurrent.length; i++)
   {
    if (aCurrent[i].url != aURL) continue;
    iMatches++;
    // Exact match
    if (aCurrent[i].position == aPosition
     && aCurrent[i].title == aTitle
     && aCurrent[i].preview == aPreview)
    {
      bUpdated = false;
      iExistingId = aCurrent[i].id;
      sState = aCurrent[i].state;
      break;
    }
    // Otherwise treat as updated
    bUpdated = true;
    // Multiple existing matches of URL, match by position
    if (iMatches > 1 && aCurrent[i].position == aPosition)
    {
     iExistingId = aCurrent[i].id;
     sState = aCurrent[i].state;
     break;
    }
    // Otherwise use first match
    else if (iMatches == 1)
    {
     iExistingId = aCurrent[i].id;
     sState = aCurrent[i].state;
    }
   }
   return { id: iExistingId, updated: bUpdated, state: sState };
  }
  let place = this._place;
  let job = this._job;
  job.stateOld = place.getState();
  let iLivemarkId = place.id;
  // Existing code enforces well-formedness
  // Might be able to parse some aResults on bozo
  if (!aResult || !aResult.doc || aResult.bozo)
  {
   place.finishJob(false);
   throw Components.results.NS_ERROR_FAILURE;
  }
  let loadgroup = Cc["@mozilla.org/network/load-group;1"].createInstance(Ci.nsILoadGroup);
  let secMan = Cc["@mozilla.org/scriptsecuritymanager;1"]
   .getService(Ci.nsIScriptSecurityManager);
  let feedPrincipal = secMan.createCodebasePrincipal(place.feedURI, {});
  let feedData = aResult.doc.QueryInterface(Ci.nsIFeed);
  // Update site location if feed has channel <link> and:
  // 1) Current site location not set, or:
  // 2) Current site location equals current feed location, but differs from channel <link>
  if (feedData.link)
  {
   if (!place.siteURI
    || (place.siteURI.equals(place.feedURI)
     && !place.siteURI.equals(feedData.link)))
   {
    place.setToken("custom_site", feedData.link.spec);
    logMessage(".. Site location updated");
   }
  }
  LiveClickRemote.getChildren(iLivemarkId,
   function (aChildren)
   {
    logMessage(".. Current count: " + aChildren.length);
    logMessage(".. Items discovered: " + feedData.items.length);
    let countsOld = new Counts();
    let countsNew = new Counts();
    let bUpdated = false;
    let pagesInsert = [], pagesExisting = [], proxies = [];
    let iInserts = 0, iExisting = 0;
    let bAllItemsFound = false;
    let iItemsFound = feedData.items.length, iItemsTested = 0;
    for (let i = 0; i < iItemsFound; i++)
    {
     let entry = feedData.items.queryElementAt(i, Ci.nsIFeedEntry);
     if (!entry.link)
     {
      iItemsTested++;
      continue;
     }
     // Make sure item link is safe
     try
     {
      Services.scriptSecurityManager
       .checkLoadURIWithPrincipal(feedPrincipal, entry.link,
        Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL);
     }
     catch (e)
     {
      iItemsTested++;
      continue;
     }
     countsNew.total++;
     let sURL = entry.link.spec;
     let sTitle = entry.title ? entry.title.plainText().replace(/\n+/, " ") : "";
     // If too long, save first 355 characters only
     // Complete the last word, if possible
     let sPreview = entry.summary ? entry.summary : entry.content;
     sPreview = sPreview ? sPreview.plainText() : "";
     if (sPreview.length > 360)
      sPreview = sPreview.substring(0, 355).replace(/\s+\S*$/, "") + " ...";
     let existing = getExisting(aChildren, sURL, i+1, sTitle, sPreview);
     if (existing.id > 0)
     {
      countsOld[existing.state]++;
      pagesExisting.push({ id: existing.id, position: ++iExisting, title: sTitle, preview: sPreview });
      if (existing.updated) bUpdated = true;
      iItemsTested++;
      continue;
     }
     // New item is discovered
     bUpdated = true;
     // GUIDs more accurately identify initial states for proxied links
     let sProxy = "";
     if (entry.id && entry.id != sURL)
     {
      // Make sure guid link is safe
      try
      {
       Services.scriptSecurityManager
        .checkLoadURIWithPrincipal(feedPrincipal, entry.id,
         Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL);
       sProxy = entry.id;
       proxies.push({ url: sURL, proxy: sProxy });
      }
      catch (e) {}
     }
     let sURLtoTest = sProxy != "" ? sProxy : sURL;
     LiveClickRemote.getPageStateByURL(sURLtoTest,
      (function (sState)
      {
       let iPosition = ++iInserts;
       // Link has no state history
       // Check if link was manually visited prior to item discovery
       if (sState == "unknown")
       {
        let linkToTest = sProxy != "" ? PlacesUIUtils.createFixedURI(sProxy) : entry.link;
        PlacesUtils.asyncHistory.isURIVisited(linkToTest,
         function (aURI, aIsVisited)
         {
          if (aIsVisited) sState = "read";
          if (sState != "unknown")
           countsOld[sState]++;
          else
           sState = "new";
          countsNew[sState]++;
          pagesInsert.push({ url: sURL, position: iPosition, title: sTitle, preview: sPreview, state: sState });
          iItemsTested++;
          if (bAllItemsFound && iItemsFound == iItemsTested)
           readyToUpdate();
         }
        );
       }
       // Link has previous state history
       else
       {
        countsNew[sState]++;
        pagesInsert.push({ url: sURL, position: iPosition, title: sTitle, preview: sPreview, state: sState });
        iItemsTested++;
        if (bAllItemsFound && iItemsFound == iItemsTested)
         readyToUpdate();
       }
      })
     );
    }
    delete job.processor;
    bAllItemsFound = true;
    if (iItemsFound == iItemsTested) readyToUpdate();
    function readyToUpdate ()
    {
     // Downgrade previous new items to fresh
     LiveClickRemote.changeChildrenStates(iLivemarkId, "new", "fresh");
     // Update counts
     countsNew.loaded = true;
     countsNew.read = countsOld.read;
     countsNew.fresh = countsOld.fresh + countsOld.new;
     // Unread count is anything that's not read, fresh, or new
     countsNew.unread = countsNew.total - countsNew.read - countsNew.fresh - countsNew.new;
     // Store counts and update parent counts
     place.counts = countsNew;
     // Nothing to insert/update; quit here
     if (!bUpdated)
     {
      place.finishJob(true);
      return;
     }
     // Finish job only after remote insert and updates complete
     // Otherwise getChildren may be inaccurate
     let iReady = 0;
     function readyToNotify (aCount)
     {
      iReady = iReady + aCount;
      if (iReady == pagesInsert.length + pagesExisting.length)
       place.finishJob(true);
     }
     LiveClickRemote.orphanChildren(iLivemarkId);
     if (pagesExisting.length > 0)
     {
      logMessage(".. Count to update: " + pagesExisting.length);
      LiveClickRemote.updateChildren(iLivemarkId, pagesExisting, pagesInsert.length, readyToNotify);
     }
     if (pagesInsert.length > 0)
     {
      logMessage(".. Count to insert: " + pagesInsert.length);
      LiveClickRemote.insertChildren(iLivemarkId, pagesInsert, readyToNotify);
     }
     if (proxies.length > 0)
     {
      logMessage(".. Proxies to insert: " + proxies.length);
      LiveClickRemote.insertProxies(proxies);
     }
    }
   }
  );
 },
 getInterface : function (aIID)
 {
  return this.QueryInterface(aIID);
 },
 QueryInterface : XPCOMUtils.generateQI([
  Ci.nsIFeedResultListener,
  Ci.nsIStreamListener,
  Ci.nsIRequestObserver,
  Ci.nsIInterfaceRequestor
 ])
}
// Basic functions to store item counts and calculate feed states
// Local counts are mutually exclusive, i.e. unread != unread + fresh + new
function Counts ()
{
 this.loaded = false;
 this.zero();
}
Counts.prototype =
{
 getState : function ()
 {
  if (!this.loaded) return "unknown";
  let sState = "unknown";
  if (this.new > 0)
   sState = "new";
  else if (this.fresh > 0)
   sState = "fresh";
  else if (this.unread > 0)
   sState = "unread";
  else if (this.total - this.read == 0)
   sState = "read";
  return sState;
 },
 shiftAll : function (aStateTo)
 {
  let iTotal = this.total;
  this.zero();
  this.total = iTotal;
  this[aStateTo] = iTotal;
 },
 shiftAllFrom : function (aStateFrom, aStateTo)
 {
  this[aStateTo] += this[aStateFrom];
  this[aStateFrom] = 0;
 },
 // Returns true if state changed
 shiftOne : function (aStateFrom, aStateTo)
 {
  //logMessage("Pre  "+aStateFrom+"->"+aStateTo+" : " + this[aStateFrom] + "->" + this[aStateTo]);
  if (this[aStateFrom] == 0) return false;
  this[aStateFrom]--;
  this[aStateTo]++;
  //logMessage("Post "+aStateFrom+"->"+aStateTo+" : " + this[aStateFrom] + "->" + this[aStateTo]);
  if (aStateTo == "new" || aStateTo == "fresh")
   return this[aStateTo] == 1;
  else if (aStateFrom == "new" || aStateFrom == "fresh")
   return this[aStateFrom] == 0;
  else
   return this[aStateFrom] + 1 == this.total;
 },
 // Returns true if state changed
 resizeFolder : function (aState, aSize)
 {
  this[aState] += aSize;
  this.total += aSize;
  this.loaded = this.total > 0;
  if (aState == "new" || aState == "fresh")
   return (this[aState] == aSize || this[aState] == 0);
  else if (aState != "read")
   return (this.read + aSize == this.total || this.read == this.total);
  return false;
 },
 hasAllRead : function ()
 {
  return (this.total - this.read == 0);
 },
 zero : function ()
 {
  this.total = 0;
  this.new = 0;
  this.fresh = 0;
  this.unread = 0;
  this.read = 0;
  this.unknown = 0;
 }
}
var UberObserver =
{
 // nsINavHistoryService
 onVisit : function (aURI, aVisitID, aTime, aSessionID, aReferringID, aMigrateType, aAdded)
 {
  // Mark matching live bookmark items as read
  LiveClickRemote.getPagesByURL(aURI.spec,
   function (aPages)
   {
    for (let i = 0; i < aPages.length; i++)
     LiveClickPlaces.markPage(aPages[i], "read");
   }
  );
  // Only test followed (1) or typed (5) links at this point
  // Clicked livemarks are treated like a followed link
  if (aMigrateType != 1 && aMigrateType != 5)
   return;
  // Mark feed as seen/read if location
  let iOnVisit = LiveClickPrefs.getValue("locationVisit");
  if (iOnVisit == 0) return;
  for (let id in LiveClickPlaces.places)
  {
   let livemark = LiveClickPlaces.places[id];
   if (livemark.type != 1) continue;
   if (livemark.siteURI && aURI.equals(livemark.siteURI))
    LiveClickPlaces.markLivemark(livemark.id, iOnVisit == 1 ? "seen" : "read");
  }
 },
 onPageChanged : function (aURI, aWhat, aValue)
 {
  // Update livemark icon when favicon discovered
  const ATTRIBUTE_FAVICON = 3; // favicon updated
  if (aWhat != ATTRIBUTE_FAVICON) return;
  for (let id in LiveClickPlaces.places)
  {
   let livemark = LiveClickPlaces.places[id];
   if (livemark.type != 1) continue;
   if (livemark.siteURI && aURI.equals(livemark.siteURI))
    livemark.cacheFavicon(true);
  }
 },
 onClearHistory : function ()
 {
  // Clear live bookmarks history with private data
  let bClearPrivate = LiveClickPrefs.getValue("browserClear");
  if (bClearPrivate) LiveClickPlaces.clearHistory(true);
 },
 // UpdateBatch also defined in nsINavBookmarksService,
 /*
 onBeginUpdateBatch : function () {},
 onEndUpdateBatch : function () {},
 */
 onTitleChanged : function () {},
 onDeleteURI : function () {},
 onPageExpired : function () {},
 // nsINavBookmarksService
 // Catch new livemarks when livemark/feedURI anno set
 onItemChanged : function (id, property, isAnno, value, lastModified, itemType, parentId, guid, parentGuid)
 {
  if (property != "livemark/feedURI") return;
  PlacesUtils.livemarks.getLivemark({ id: id })
   .then(aLivemark => {
    LiveClickPlaces.initLivemark(id);
   }, () => undefined);
 },
 // Update parent counts on livemark move
 onItemMoved : function (aItemId, aOldParent, aOldIndex, aNewParent, aNewIndex)
 {
  // Ignore everything but livemarks
  if (LiveClickPlaces.getType(aItemId) != 1) return;
  // Ignore moves within the same folder
  if (aOldParent == aNewParent) return;
  LiveClickPlaces.getPlace(aItemId).parentId = aNewParent;
  let sState = LiveClickPlaces.getPlace(aItemId).getState();
  if (LiveClickPlaces.getPlace(aOldParent).counts.resizeFolder(sState, -1))
   LiveClickPlaces.getPlace(aOldParent).broadcast();
  // Always initialize, in case of a new parent folder
  LiveClickPlaces.initFolder(aNewParent);
  if (LiveClickPlaces.getPlace(aNewParent).counts.resizeFolder(sState, 1))
   LiveClickPlaces.getPlace(aNewParent).broadcast();
 },
 onItemRemoved : function (aItemId, aParentId, aIndex, aItemType)
 {
  let iType = LiveClickPlaces.getType(aItemId);
  // Delete livemark data
  if (iType == 1)
  {
   // Update parent counts on livemark removal
   let iParentId = LiveClickPlaces.getPlace(aItemId).parentId;
   let sState = LiveClickPlaces.getPlace(aItemId).getState();
   if (LiveClickPlaces.getPlace(iParentId).counts.resizeFolder(sState, -1))
    LiveClickPlaces.getPlace(iParentId).broadcast();
   LiveClickPlaces.removePlace(aItemId);
  }
  // Delete folder data
  else if (iType == 2)
  {
   LiveClickPlaces.removePlace(aItemId);
  }
 },
 onBeginUpdateBatch : function () {},
 onEndUpdateBatch : function () {},
 onItemAdded : function () {},
 onItemVisited : function () {}
}
function logMessage (aMessage)
{
 Cc["@mozilla.org/observer-service;1"]
  .getService(Ci.nsIObserverService)
  .notifyObservers(null, "liveclick-logging", aMessage);
}
