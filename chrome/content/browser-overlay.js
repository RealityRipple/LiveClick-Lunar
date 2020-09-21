Cu.import("resource://liveclick/liveclick.jsm");
Cu.import("resource://liveclick/liveplaces.jsm");
Cu.import("resource://liveclick/prefs.jsm");
if (typeof(LiveClickChrome) == "undefined")
{
 var LiveClickChrome = {};
}
// LiveClick browser overlay class
LiveClickChrome.Browser =
{
 strings : null,
 // Initialization code
 init : function ()
 {
  // Start LiveClick services
  LiveClick.init();
  // Get localized strings
  this.strings = document.getElementById("liveclick-strings");
  let observers = Cc["@mozilla.org/observer-service;1"]
      .getService(Ci.nsIObserverService);
  // Observe feed state, favicons, status changes
  observers.addObserver(this, "liveclick-statechange", false);
  observers.addObserver(this, "liveclick-monitor", false);
  observers.addObserver(this, "liveclick-checking", false);
  observers.addObserver(this, "liveclick-suspend", false);
  // Observe annotation changes to insert/remove livemark loading elements
  PlacesUtils.annotations.addObserver(this, false);
  // Hook onto bookmarks menu popups
  // http://mxr.mozilla.org/mozilla-central/source/browser/components/places/content/browserPlacesViews.js#782
  let oriMayAddCommands = PlacesViewBase.prototype._mayAddCommandsItems;
  PlacesViewBase.prototype._mayAddCommandsItems = function (aPopup)
  {
   if (aPopup == this._rootElt) return;
   if (LiveClickChrome.LivemarkMenu.popup(aPopup) == 1) return;
   oriMayAddCommands.apply(this, arguments);
  }
  // Hook icons, observers onto livemarks in bookmarks menus
  // http://mxr.mozilla.org/mozilla-central/source/browser/components/places/content/browserPlacesViews.js#401
  let oriInsertToPopup = PlacesViewBase.prototype._insertNewItemToPopup;
  PlacesViewBase.prototype._insertNewItemToPopup = function (aNewChild, aPopup, aBefore)
  {
   let element = oriInsertToPopup.apply(this, arguments);
   if (!PlacesUtils.nodeIsFolder(aNewChild)) return element;
   // Apply state observers to folder being inserted
   LiveClickChrome.Browser.folderBeforeInsert(element, aNewChild.itemId);
   // Replace native menu with LiveClick livemark, if applicable
   PlacesUtils.livemarks.getLivemark({ id: aNewChild.itemId })
    .then(
     (aLivemark =>
     {
      this._domNodes.delete(aNewChild);
      // Copy native menu classes to LiveClick livemark
      let sClassName = element.className;
      let livemark = LiveClickChrome.Browser.createLivemarkMenu(aNewChild, sClassName);
      if (!this._domNodes.has(aNewChild))
       this._domNodes.set(aNewChild, livemark);
      aPopup.replaceChild(livemark, element);
      // Hide livemark in chevron if necessary
      if (document.defaultView.getComputedStyle(element, null)
        .getPropertyValue("display") == "none")
       livemark.hidden = "true";
     }
     ).bind(this),
     () => undefined
    );
   return element;
  }
  // Hook icons, observers onto livemarks on bookmarks toolbar
  // http://mxr.mozilla.org/mozilla-central/source/browser/components/places/content/browserPlacesViews.js#1044
  let oriInsertNew = PlacesToolbar.prototype._insertNewItem;
  PlacesToolbar.prototype._insertNewItem = function (aChild, aBefore)
  {
   oriInsertNew.apply(this, arguments);
   if (!PlacesUtils.nodeIsFolder(aChild)) return;
   // Apply state observers to folder being inserted
   let button = aBefore ? aBefore.previousElementSibling : this._rootElt.lastElementChild;
   LiveClickChrome.Browser.folderBeforeInsert(button, aChild.itemId);
   let bookmarksToolbar = this;
   let testForLivemark =
   {
    notify : function (timer)
    {
     // Replace native button with LiveClick livemark, if applicable
     PlacesUtils.livemarks.getLivemark( {id: aChild.itemId })
      .then(
       aLivemark =>
       {
        bookmarksToolbar._domNodes.delete(aChild);
        let livemark = LiveClickChrome.Browser.createLivemarkButton(aChild);
        if (!bookmarksToolbar._domNodes.has(aChild))
         bookmarksToolbar._domNodes.set(aChild, livemark);
        bookmarksToolbar._rootElt.replaceChild(livemark, button);
       },
       () => undefined
      );
    }
   }
   // Wait 500ms for livemark/feedURI anno to be set on newly created live bookmark
   // Only then can we test if inserted folder is a live bookmark
   Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer)
    .initWithCallback(testForLivemark, 500, Ci.nsITimer.TYPE_ONE_SHOT);
  }
  if (!LiveClickPrefs.getValue("checkAutomatic"))
   LiveClickChrome.MainMenu.setStatus("suspend", true);
  // Remove listeners/observers on window unload
  window.addEventListener("unload", function() { LiveClickChrome.Browser.onUnload(); }, false);
 },
 onUnload : function ()
 {
  let observers = Cc["@mozilla.org/observer-service;1"]
      .getService(Ci.nsIObserverService);
  observers.removeObserver(this, "liveclick-statechange");
  observers.removeObserver(this, "liveclick-monitor");
  observers.removeObserver(this, "liveclick-checking");
  observers.removeObserver(this, "liveclick-suspend");
  PlacesUtils.annotations.removeObserver(this);
 },
 createLivemarkMenu : function (aChild, aClassName)
 {
  let menu = document.createElement("menu");
  menu.className = aClassName;
  menu.setAttribute("label", PlacesUIUtils.getBestTitle(aChild));
  menu.setAttribute("container", "true");
  menu.setAttribute("livemark", "true");
  menu._placesNode = aChild;
  let popup = LiveClickChrome.Browser.createLivemarkPopup(aChild);
  menu.appendChild(popup);
  LiveClickChrome.Browser.folderBeforeInsert(menu, aChild.itemId);
  return menu;
 },
 createLivemarkButton : function (aChild)
 {
  let button = document.createElement("toolbarbutton");
  button.className = "bookmark-item";
  button.setAttribute("label", PlacesUIUtils.getBestTitle(aChild));
  button.setAttribute("type", "menu");
  button.setAttribute("container", "true");
  button.setAttribute("livemark", "true");
  button._placesNode = aChild;
  let popup = LiveClickChrome.Browser.createLivemarkPopup(aChild);
  button.appendChild(popup);
  LiveClickChrome.Browser.folderBeforeInsert(button, aChild.itemId);
  return button;
 },
 createLivemarkPopup : function (aChild)
 {
  let popup = document.createElement("menupopup");
  popup._livemarkId = aChild.itemId;
  popup.setAttribute("placespopup", "true");
  popup.setAttribute("emptyplacesresult", "true");
  popup.setAttribute("context", "placesContext");
  popup.addEventListener("popupshowing", function (event) { LiveClickChrome.LivemarkMenu.popup(event.target); }, false);
  popup.addEventListener("popuphidden", function (event) { LiveClickChrome.LivemarkMenu.hide(event.target); }, false);
  return popup;
 },
 folderBeforeInsert : function (aElement, aPlaceId)
 {
  let observer = document.createElement("observes");
  observer.setAttribute("element", "liveclick-states");
  observer.setAttribute("attribute", "id:" + aPlaceId.toString());
  observer.addEventListener("broadcast", function() { LiveClickChrome.Browser.folderOnStateChange(this.parentNode); }, false);
  aElement.insertBefore(observer, aElement.lastChild);
  LiveClickChrome.Browser.folderStyle(aElement);
 },
 // Called whenever a livemark/folder state change is broadcast
 folderOnStateChange : function (aElement)
 {
  LiveClickChrome.Browser.folderStyle(aElement);
  let iPlaceId = aElement._placesNode.itemId;
  if (LiveClickPlaces.getType(iPlaceId) != 1) return;
  // Update item styles and add commands if open
  let popup = aElement.lastChild;
  if (popup.hasAttribute("isShowing"))
   LiveClickChrome.LivemarkMenu.update(popup);
  // Force re-population on next view
  else
   popup.removeAttribute("populated");
 },
 // Style livemark/folder using feed settings and styles
 folderStyle : function (aElement)
 {
  let iPlaceId = aElement._placesNode.itemId;
  // Style only if livemark/folder data already loaded
  let iType = LiveClickPlaces.getType(iPlaceId);
  if (iType == 0) return;
  // Ignore bookmarks toolbar, bookmarks menu, etc. ?
  if (PlacesUtils.isRootItem(iPlaceId)) return;
  let sState = LiveClickPlaces.getPlace(iPlaceId).getState();
  let iStyle = iType == 1 ? LiveClickPrefs.getStyles("Feed")[sState]
         : LiveClickPrefs.getStyles("Folder")[sState];
  if (iStyle != 0)
   aElement.setAttribute("liveclickfeed",
    iStyle == -1 ? "custom" + sState : iStyle.toString());
  else
   aElement.removeAttribute("liveclickfeed");
  if (iType != 1) return;
  LiveClickChrome.Browser.livemarkIconize(aElement);
  LiveClickChrome.Browser.livemarkCounter(aElement);
 },
 // Iconize livemark element
 livemarkIconize : function (aElement)
 {
  let iPlaceId = aElement._placesNode.itemId;
  let sIconURL = "chrome://browser/skin/livemark-folder.png";
  if (LiveClickPrefs.getValue("showFavIcons"))
  {
   let sIconData = LiveClickPlaces.getPlace(iPlaceId).icondata;
   if (sIconData) sIconURL = sIconData;
  }
  aElement.setAttribute("image", sIconURL);
 },
 // Display new/unread count on livemarks
 livemarkCounter : function (aElement)
 {
  let iPlaceId = aElement._placesNode.itemId;
  let iShowCount = LiveClickPrefs.getValue("showCount");
  if (iShowCount == 0)
  {
   aElement.removeAttribute("counter");
   return;
  }
  // Counter should not exceed max number of items per feed
  let iLimit = LiveClickPrefs.getValue("maxFeedItems");
  iLimit = LiveClickPlaces.getPlace(iPlaceId).getToken("custom_max", iLimit);
  // If no limit set, calculate counter from stored counts
  let counts = LiveClickPlaces.getPlace(iPlaceId).counts;
  if (iLimit == 0 || counts.total <= iLimit)
  {
   let iCounter = 0;
   if (iShowCount == 1)
    iCounter = counts.new + counts.fresh;
   else
    iCounter = counts.total - counts.read;
   if (iCounter > 0)
    aElement.setAttribute("counter", "(" + iCounter + ")");
   else
    aElement.removeAttribute("counter");
   return;
  }
  // If limit set, calculate counter by states of visible items
  LiveClickPlaces.getItems(iPlaceId,
   function (aItems)
   {
    iCounter = 0;
    for (let i = 0; i < iLimit; i++)
    {
     if (!aItems[i])
     {
      LiveClick.debug("!!! i:"+i+", items:"+aItems.length+", limit:"+iLimit);
      break;
     }
     let sState = aItems[i].state;
     if (sState == "read") continue;
     if (iShowCount == 1 && (sState == "new" || sState == "fresh"))
      iCounter++;
     else if (iShowCount == 2)
      iCounter++;
    }
    if (iCounter > 0)
     aElement.setAttribute("counter", "(" + iCounter + ")");
    else
     aElement.removeAttribute("counter");
   }
  );
 },
 bookmarkClick : function (aEvent, aView)
 {
  let theBookmark = aEvent.originalTarget;
  let iButton = aEvent.button;
  // Nothing to do on right click
  if (iButton == 2) return;
  // Process livemark click
  if (theBookmark.getAttribute("livemark"))
  {
   let sLocal = theBookmark.localName;
   let iOnLeft = LiveClickPrefs.getValue("clickLeft");
   let iOnMiddle = LiveClickPrefs.getValue("clickMiddle");
   let iOnAccel = LiveClickPrefs.getValue("clickAccel");
   let iAction = -1;
   // -1 => Do browser default
   //  0 => Do nothing
   //  1 => Open location in current window/tab
   //  2 => Open location in new tab
   //  3 => Open feed in current window/tab
   //  4 => Open feed in new tab
   //  5 => Open all items in tabs
   //  6 => Mark all items as read
   //  7 => Open unread items in tabs
   //  8 => Open fresh items in tabs
   //  9 => Reload live bookmark
   // Set as accel click action if
   // 1) action NOT browser default
   // 2) NOT "Open in Tabs" (default browser action)
   if (aEvent.ctrlKey && iOnAccel != -1 && iOnAccel != 5)
    iAction = iOnAccel;
   // Set as left click action if
   // 1) action NOT browser default and NOT do nothing (default browser action)
   // 2) bookmark NOT located directly on bookmarks toolbar
   else if (iButton == 0 && iOnLeft > 0 && sLocal != "toolbarbutton")
    iAction = iOnLeft;
   // Set as middle click action if
   // 1) action NOT browser default
   // 2) NOT "Open in Tabs" (default browser action)
   else if (iButton == 1 && iOnMiddle != -1 && iOnMiddle != 5)
    iAction = iOnMiddle;
   if (iAction == 0) return; // Do nothing
   // Continue if action NOT browser default
   if (iAction > 0)
   {
    // Test for [Ext] Stay-Open Menu 1.5+ installed and middle, ctrl-clicks
    let bStayOpen = typeof stayopen != "undefined"
        && (iButton == 1 || (aEvent.ctrlKey && stayopen.Ctrl));
    // Close menus now to avoid drawing over the open tabs confirm-dialog
    // Don't close on mark feed read, reload feed actions
    if (iAction != 6 && iAction != 9 && !bStayOpen)
     LiveClickChrome.Browser.closeMenus(theBookmark);
    // Even actions open bookmark in new tab
    // Odd actions open bookmark in current window/tab
    let sWhereToOpen = iAction % 2 == 0 ? "tab" : "current";
    // If shift key pressed, open in new window
    if (aEvent.shiftKey) sWhereToOpen = "window";
    let iLivemarkId = theBookmark._placesNode.itemId;
    let sFeed = LiveClickPlaces.getPlace(iLivemarkId).feedURI.spec;
    let uri = LiveClickPlaces.getPlace(iLivemarkId).siteURI;
    let sSite = uri ? uri.spec : sFeed;
    // Open location
    if (iAction == 1 || iAction == 2)
     LiveClickChrome.Utils.openURL(sSite, aEvent, sWhereToOpen);
    // Open feed
    else if (iAction == 3 || iAction == 4)
     LiveClickChrome.Utils.openFeed(sFeed, aEvent, sWhereToOpen);
    // Open all items in tabs
    else if (iAction == 5)
     LiveClickChrome.Utils.openGroup(iLivemarkId, "");
    // Mark all items as read
    else if (iAction == 6)
     LiveClickPlaces.markLivemark(iLivemarkId, "read");
    // Open unread items in tabs
    else if (iAction == 7)
     LiveClickChrome.Utils.openGroup(iLivemarkId, "unread");
    // Open fresh items in tabs
    else if (iAction == 8)
     LiveClickChrome.Utils.openGroup(iLivemarkId, "unseen");
    // Reload live bookmark
    else if (iAction == 9)
     LiveClickPlaces.checkLivemark(iLivemarkId);
    return;
   }
  }
  // When clicking live bookmark items...
  let place = theBookmark._placesNode;
  if (place && place.pageId)
  {
   let bKeepOpen = iButton == 1 && LiveClickPrefs.getValue("keepOpenOnMiddle");
   let bExceptLast = bKeepOpen && LiveClickPrefs.getValue("keepOpenExceptLast");
   let sLastState = "unknown";
   if (bKeepOpen)
    sLastState = LiveClickPlaces.getPlace(place.parentId).getState();
   // Mark live bookmark item as read
   // Do now, because history may not catch visit, e.g. FeedBurner
   // Also forces UI to update style while menu is open
   LiveClickPlaces.markPage(place.pageId, "read");
   // Keep livemark menu open on middle click
   // Except when feed state changes to read (i.e. last unread item read)
   if (bKeepOpen && (!bExceptLast
     || (sLastState == "read"
      || !LiveClickPlaces.getPlace(place.parentId).counts.hasAllRead())))
   {
    BookmarksEventHandler.onCommand(aEvent, aView);
    return;
   }
  }
  // If you reach this point, perform default middle click action(s)
  BookmarksEventHandler.onClick(aEvent, aView);
 },
 // Close any open popup menus
 closeMenus : function (aElement)
 {
  if (aElement.localName != "menu" && aElement.localName != "menuitem")
   return;
  for (let node = aElement.parentNode; node; node = node.parentNode)
  {
   if (node.localName == "menupopup")
    node.hidePopup();
   else if (node.localName != "menu")
    break;
  }
 },
 // nsIAnnotationService
 onItemAnnotationSet : function (aItemId, aAnnotationName)
 {
  switch (aAnnotationName)
  {
   case "liveclick/loading":
   case "liveclick/loadfailed":
    let broadcaster = document.getElementById("liveclick-states");
    if (!broadcaster) return;
    broadcaster.setAttribute("id:" + aItemId, Date.now().toString());
    break;
  }
 },
 onItemAnnotationRemoved : function (aItemId, aAnnotationName)
 {
  switch (aAnnotationName)
  {
   case "liveclick/loading":
   case "liveclick/loadfailed":
    let broadcaster = document.getElementById("liveclick-states");
    if (!broadcaster) return;
    broadcaster.setAttribute("id:" + aItemId, Date.now().toString());
    break;
  }
 },
 onPageAnnotationSet : function (aUri, aAnnotationName) {},
 onPageAnnotationRemoved : function (aUri, aAnnotationName) {},
 // aData is always type string
 observe : function (aSubject, aTopic, aData)
 {
  if (aTopic == "liveclick-statechange")
  {
   // aData sent as "placeId"
   let broadcaster = document.getElementById("liveclick-states");
   if (!broadcaster) return;
   broadcaster.setAttribute("id:" + aData, Date.now().toString());
  }
  else if (aTopic == "liveclick-monitor")
  {
   LiveClickChrome.Monitors.monitor(parseFloat(aData));
  }
  else if (aTopic == "liveclick-checking")
  {
   if (aData == "true")
    LiveClickChrome.MainMenu.setStatus("throbbing", true);
   else
    LiveClickChrome.MainMenu.removeStatus("throbbing");
  }
  else if (aTopic == "liveclick-suspend")
  {
   if (aData == "true")
    LiveClickChrome.MainMenu.setStatus("suspend", true);
   else
    LiveClickChrome.MainMenu.removeStatus("suspend");
  }
 }
}
LiveClickChrome.LivemarkMenu =
{
 popup : function (aPopup)
 {
  let iLivemarkId = aPopup._livemarkId;
  if (LiveClickPlaces.getType(iLivemarkId) != 1) return 0;
  LiveClickChrome.LivemarkMenu.ensureMarkers(aPopup);
  // Reload livemark now if expired
  if (LiveClickPrefs.getValue("checkOnDemand"))
   LiveClickPlaces.checkLivemarkIfExpired(iLivemarkId);
  // Let others know that menu is open
  aPopup.setAttribute("isShowing", true);
  // Populate, style items and add commands only if necessary
  if (!aPopup.hasAttribute("populated"))
   LiveClickChrome.LivemarkMenu.update(aPopup);
  return 1;
 },
 hide : function (aPopup)
 {
  if (!aPopup._livemarkId) return;
  let iLivemarkId = aPopup._livemarkId;
  if (LiveClickPlaces.getType(iLivemarkId) != 1) return;
  // Menu has closed; remove attribute
  if (aPopup.hasAttribute("isShowing"))
   aPopup.removeAttribute("isShowing");
  let iOnView = LiveClickPrefs.getValue("livemarkView");
  if (iOnView == 0) return;
  let sState = LiveClickPlaces.getPlace(iLivemarkId).getState();
  // Mark new/fresh items as unread
  if (iOnView == 1 && (sState == "new" || sState == "fresh"))
  {
   LiveClickPlaces.markLivemark(iLivemarkId, "seen");
   LiveClickChrome.LivemarkMenu.update(aPopup);
  }
  // Mark all items as read
  else if (iOnView == 2 && sState != "read")
  {
   LiveClickPlaces.markLivemark(iLivemarkId, "read");
   LiveClickChrome.LivemarkMenu.update(aPopup);
  }
 },
 update : function (aPopup)
 {
  // Show the loading status only if there are no entries yet
  if (aPopup.hasAttribute("emptyplacesresult"))
   LiveClickChrome.LivemarkMenu.setStatusItem(aPopup, 1);
  let iLivemarkId = aPopup._livemarkId;
  LiveClickPlaces.getItems(iLivemarkId,
   function (aItems)
   {
    let livemark = LiveClickPlaces.getPlace(iLivemarkId);
    let dtPopulated = aPopup.getAttribute("populated");
    if (!dtPopulated || dtPopulated < livemark.populated)
     LiveClickChrome.LivemarkMenu.populate(aPopup, aItems);
    else
     LiveClickChrome.LivemarkMenu.restyle(aPopup, aItems);
    LiveClickChrome.LivemarkMenu.addCommands(aPopup);
    LiveClickChrome.LivemarkMenu.setStatusItem(aPopup);
    aPopup.setAttribute("populated", livemark.populated);
   }
  );
 },
 populate : function (aPopup, aItems)
 {
  function insertNode (aPlacesNode, aIndex)
  {
   let index = Array.indexOf(aPopup.childNodes, aPopup._markerStart) + aIndex + 1;
   let element = createItem(aPlacesNode);
   let bHidden = false;
   let iStyle = styles[aPlacesNode.state];
   if (iStyle != 0)
   {
    element.setAttribute("liveclick",
     iStyle == -1 ? "custom" + aPlacesNode.state : iStyle.toString());
    let sDisplay = document.defaultView.getComputedStyle(element, null)
        .getPropertyValue("display");
    bHidden = (sDisplay == "none");
   }
   if (!bHidden)
   {
    iItemsShown++;
    let before = aPopup.childNodes[index] || aPopup._markerEnd;
    aPopup.insertBefore(element, before);
   }
  }
  function createItem (aPlacesNode)
  {
   let element = document.createElement("menuitem");
   element.className = "menuitem-iconic bookmark-item menuitem-with-favicon";
   element.setAttribute("scheme", PlacesUIUtils.guessUrlSchemeForUI(aPlacesNode.uri));
   element.setAttribute("label", PlacesUIUtils.getBestTitle(aPlacesNode));
   element.setAttribute("tooltip", "liveclick-lit");
   element.setAttribute("context", "liveclick-items-menu");
   element._placesNode = aPlacesNode;
   return element;
  }
  let iLivemarkId = aPopup._livemarkId;
  let child = aPopup.firstChild;
  while (child)
  {
   let nextchild = child.nextSibling;
   // Clear out existing live bookmark items
   if (child._placesNode)
    aPopup.removeChild(child);
   // Remove existing LiveClick commands; re-added later
   let sClass = child.getAttribute("class");
   if (/liveclick\-/.test(sClass))
    aPopup.removeChild(child);
   child = nextchild;
  }
  let styles = LiveClickPrefs.getStyles("Item");
  // Don't show more than max number of items per feed
  let iItemsMax = LiveClickPrefs.getValue("maxFeedItems");
  iItemsMax = LiveClickPlaces.getPlace(iLivemarkId).getToken("custom_max", iItemsMax);
  let iItemsShown = 0;
  for (let i = 0; i < aItems.length; i++)
  {
   let node =
   {
    parentId : iLivemarkId,
    uri : aItems[i].url,
    type : Ci.nsINavHistoryResultNode.RESULT_TYPE_URI,
    title : aItems[i].title,
    itemId : -1,
    pageId : aItems[i].id,
    state : aItems[i].state
   };
   insertNode(node, i);
   if (iItemsShown == iItemsMax) break;
  }
  // Show empty placeholder
  if (aItems.length == 0)
   LiveClickChrome.LivemarkMenu.addEmptyItem(aPopup);
  // Show "No Unread Items" placeholder if no items visible
  if (aItems.length > 0 && iItemsShown == 0)
   LiveClickChrome.LivemarkMenu.addNoneUnreadItem(aPopup);
  // Hide empty placeholder
  if (aItems.length > 0)
  {
   aPopup.removeAttribute("emptyplacesresult");
   try
   {
    if (aPopup._emptyMenuitem)
     aPopup.removeChild(aPopup._emptyMenuitem);
   }
   catch (e) {}
  }
  aPopup.setAttribute("itemsShown", iItemsShown);
 },
 restyle : function (aPopup, aItems)
 {
  let iLivemarkId = aPopup._livemarkId;
  let styles = LiveClickPrefs.getStyles("Item");
  let i = 0, iItemsShown = 0;
  let child = aPopup.firstChild;
  while (child)
  {
   let nextchild = child.nextSibling;
   // Compare cached items against current children
   if (child._placesNode)
   {
    // Update style if necessary
    let sState = aItems[i].state;
    if (child._placesNode.state != sState)
    {
     child._placesNode.state = sState;
     let iStyle = styles[sState];
     if (iStyle != 0)
     {
      child.setAttribute("liveclick",
       iStyle == -1 ? "custom" + sState : iStyle.toString());
     }
     else if (iStyle == 0)
     {
      child.removeAttribute("liveclick");
     }
    }
    let sDisplay = document.defaultView.getComputedStyle(child, null)
        .getPropertyValue("display");
    if (sDisplay != "none") iItemsShown++;
    i++;
   }
   // Remove existing LiveClick commands; re-added later
   let sClass = child.getAttribute("class");
   if (/liveclick\-/.test(sClass))
    aPopup.removeChild(child);
   child = nextchild;
  }
  // If items exist but none found in menu, populate menu now
  if (i == 0 && aItems.length > 0)
  {
   LiveClickChrome.LivemarkMenu.populate(aPopup, aItems);
   return;
  }
  // Show "No Unread Items" placeholder if no items visible
  if (aItems.length > 0 && iItemsShown == 0)
   LiveClickChrome.LivemarkMenu.addNoneUnreadItem(aPopup);
  aPopup.setAttribute("itemsShown", iItemsShown);
 },
 addCommands : function (aPopup)
 {
  let place = aPopup.parentNode._placesNode;
  let iLivemarkId = place.itemId;
  let siteURI = LiveClickPlaces.getPlace(iLivemarkId).siteURI;
  let iItemsShown = aPopup.getAttribute("itemsShown");
  // Always show left click option for livemarks on toolbar
  let bToolbar = aPopup.parentNode.localName == "toolbarbutton";
  let bAllRead = LiveClickPlaces.getPlace(iLivemarkId).getState() == "read";
  let iOnLeft = LiveClickPrefs.getValue("clickLeft");
  let bShowOpen = (LiveClickPrefs.getValue("showPopupOpen")
     || (bToolbar && (iOnLeft == 1 || iOnLeft == 2)))
     && siteURI;
  let bShowFeed = LiveClickPrefs.getValue("showPopupFeed")
     || (bToolbar && (iOnLeft == 3 || iOnLeft == 4));
  let bShowTabs = (LiveClickPrefs.getValue("showPopupTabs")
     || (bToolbar && iOnLeft == 7))
     && iItemsShown >= 2 && !bAllRead;
  let bShowRead = (LiveClickPrefs.getValue("showPopupRead")
     || (bToolbar && iOnLeft == 6))
     && iItemsShown >= 1;
  let iCommandCount =
   (bShowOpen ? 1 : 0) + (bShowFeed ? 1 : 0) + (bShowTabs ? 1 : 0) + (bShowRead ? 1 : 0);
  // Don't need to show any LiveClick elements; break here
  if (iCommandCount == 0) return;
  // Create LiveClick menu elements
  // Separator
  let mnuSep1 = document.createElement("menuseparator");
  mnuSep1.setAttribute("class", "liveclick-menuseparator");
  // Open Location
  let mnuOpen = this.createItem("open");
  if (siteURI) mnuOpen.setAttribute("siteURI", siteURI.spec);
  if (place.title != "")
   mnuOpen.setAttribute("label",
    LiveClickChrome.Browser.strings.getFormattedString("openTitle", [place.title]));
  // Open Feed
  let mnuFeed = this.createItem("feed");
  let feedURI = LiveClickPlaces.getPlace(iLivemarkId).feedURI;
  mnuFeed.setAttribute("feedURI", feedURI.spec);
  // Open Unread Items in Tabs
  let mnuTabs = this.createItem("groupunread");
  mnuTabs.setAttribute("livemarkId", iLivemarkId);
  // Show Mark All Unread if all items read
  let mnuMark;
  if (bAllRead)
   mnuMark = this.createItem("markunread"); // Mark All Items as Unread
  else
   mnuMark = this.createItem("markread"); // Mark All Items as Read
  mnuMark.setAttribute("livemarkId", iLivemarkId);
  // Get placement preference
  let bShowAtTop = LiveClickPrefs.getValue("showAtTop") == 1;
  // Add LiveClick commands to top of menu
  if (bShowAtTop)
  {
   let nFirst = aPopup._markerStart;
   if (bShowOpen) aPopup.insertBefore(mnuOpen, nFirst);
   if (bShowFeed) aPopup.insertBefore(mnuFeed, nFirst);
   if (bShowTabs) aPopup.insertBefore(mnuTabs, nFirst);
   if (bShowRead) aPopup.insertBefore(mnuMark, nFirst);
   mnuSep1.setAttribute("builder", "start");
   aPopup.insertBefore(mnuSep1, nFirst);
  }
  // Append LiveClick commands to end
  else
  {
   mnuSep1.setAttribute("builder", "end");
   aPopup.appendChild(mnuSep1);
   if (bShowOpen) aPopup.appendChild(mnuOpen);
   if (bShowFeed) aPopup.appendChild(mnuFeed);
   if (bShowTabs) aPopup.appendChild(mnuTabs);
   if (bShowRead) aPopup.appendChild(mnuMark);
  }
 },
 // Make requested menu item element
 createItem : function (aType)
 {
  let element = document.createElement("menuitem");
  element.setAttribute("class", "liveclick-menuitem");
  element.setAttribute("disabled", false);
  // Open Location
  if (aType == "open")
  {
   element.setAttribute("label", LiveClickChrome.Browser.strings.getString("open"));
   element.setAttribute("accesskey", LiveClickChrome.Browser.strings.getString("openKey"));
   // Can't addListener here as checkForMiddleClick requires "oncommand" attribute
   element.setAttribute("oncommand", "LiveClickChrome.Utils.openURL(event.originalTarget.getAttribute('siteURI'), event, '');");
   element.addEventListener("click", function(event) { checkForMiddleClick(this, event); event.stopPropagation(); }, false);
  }
  // Open Feed
  else if (aType == "feed")
  {
   element.setAttribute("label", LiveClickChrome.Browser.strings.getString("feed"));
   element.setAttribute("accesskey", LiveClickChrome.Browser.strings.getString("feedKey"));
   // Can't addListener here as checkForMiddleClick requires "oncommand" attribute
   element.setAttribute("oncommand", "LiveClickChrome.Utils.openFeed(event.originalTarget.getAttribute('feedURI'), event, '');");
   element.addEventListener("click", function(event) { checkForMiddleClick(this, event); event.stopPropagation(); }, false);
  }
  // Open Unread Items in Tabs
  else if (aType == "groupunread")
  {
   element.setAttribute("label", LiveClickChrome.Browser.strings.getString("groupUnread"));
   element.setAttribute("accesskey", LiveClickChrome.Browser.strings.getString("groupUnreadKey"));
   element.addEventListener("command", function(event) { LiveClickChrome.Utils.openGroup(event.originalTarget.getAttribute("livemarkId"), "unread"); }, false);
  }
  // Mark All Items as Read
  else if (aType == "markread")
  {
   element.setAttribute("label", LiveClickChrome.Browser.strings.getString("read"));
   element.setAttribute("accesskey", LiveClickChrome.Browser.strings.getString("readKey"));
   element.setAttribute("closemenu", "none");
   element.addEventListener("command", function(event) { LiveClickPlaces.markLivemark(event.originalTarget.getAttribute("livemarkId"), "read"); }, false);
  }
  // Mark All Items as Unread
  else if (aType == "markunread")
  {
   element.setAttribute("label", LiveClickChrome.Browser.strings.getString("unread"));
   element.setAttribute("accesskey", LiveClickChrome.Browser.strings.getString("unreadKey"));
   element.setAttribute("closemenu", "none");
   element.addEventListener("command", function(event) { LiveClickPlaces.markLivemark(event.originalTarget.getAttribute("livemarkId"), "unread"); }, false);
  }
  return element;
 },
 setStatusItem : function (aPopup, aStatus)
 {
  // Constants same as Ci.mozILivemark.STATUS_ values
  const STATUS_READY = 0, STATUS_LOADING = 1, STATUS_FAILED = 2;
  let statusMenuitem = aPopup._statusMenuitem;
  // Create the status menuitem and cache it in the popup object.
  if (!statusMenuitem)
  {
   statusMenuitem = document.createElement("menuitem");
   statusMenuitem.className = "menuitem-iconic bookmark-item";
   statusMenuitem.setAttribute("disabled", true);
   aPopup._statusMenuitem = statusMenuitem;
  }
  // If no status given, get from livemark annotation
  if (!aStatus)
  {
   let iLivemarkId = aPopup._livemarkId;
   if (PlacesUtils.annotations.itemHasAnnotation(iLivemarkId, "liveclick/loadfailed"))
    aStatus = STATUS_FAILED;
   else if (PlacesUtils.annotations.itemHasAnnotation(iLivemarkId, "liveclick/loading"))
    aStatus = STATUS_LOADING;
  }
  // Status has changed, update the cached status menuitem.
  if (aStatus == STATUS_LOADING || aStatus == STATUS_FAILED)
  {
   let stringId = aStatus == STATUS_LOADING ?
       "bookmarksLivemarkLoading" : "bookmarksLivemarkFailed";
   statusMenuitem.setAttribute("lmStatus", stringId);
   statusMenuitem.setAttribute("label", PlacesUIUtils.getString(stringId));
   if (aPopup._markerStart.nextSibling != statusMenuitem)
    aPopup.insertBefore(statusMenuitem, aPopup._markerStart.nextSibling);
  }
  // The livemark has finished loading.
  else
  {
   if (aPopup._statusMenuitem.parentNode == aPopup)
    aPopup.removeChild(aPopup._statusMenuitem);
  }
 },
 addEmptyItem : function (aPopup)
 {
  if (!aPopup._emptyMenuitem)
  {
   let label = PlacesUIUtils.getString("bookmarksMenuEmptyFolder");
   aPopup._emptyMenuitem = document.createElement("menuitem");
   aPopup._emptyMenuitem.setAttribute("label", label);
   aPopup._emptyMenuitem.setAttribute("disabled", true);
  }
  aPopup.setAttribute("emptyplacesresult", "true");
  aPopup.insertBefore(aPopup._emptyMenuitem, aPopup._markerEnd);
 },
 // Add placeholder when no menu items visible
 addNoneUnreadItem : function (aPopup)
 {
  let mnuEmpty = document.createElement("menuitem");
  mnuEmpty.setAttribute("label", LiveClickChrome.Browser.strings.getString("emptyItem"));
  mnuEmpty.setAttribute("class", "liveclick-emptyitem");
  mnuEmpty.setAttribute("disabled", "true");
  aPopup.insertBefore(mnuEmpty, aPopup._markerStart.nextSibling);
 },
 // Create LiveClick equivalents to _startMarker and _endMarker
 ensureMarkers : function (aPopup)
 {
  if (!aPopup._markerStart)
  {
   aPopup._markerStart = document.createElement("menuseparator");
   aPopup._markerStart.hidden = true;
   aPopup.insertBefore(aPopup._markerStart, aPopup.firstChild);
  }
  if (!aPopup._markerEnd)
  {
   aPopup._markerEnd = document.createElement("menuseparator");
   aPopup._markerEnd.hidden = true;
   aPopup.appendChild(aPopup._markerEnd);
  }
 }
}
LiveClickChrome.MainMenu =
{
 popup : function (aEvent)
 {
  let popup = aEvent.target;
  // Populate main menu with LiveClick menu items if necessary
  if (popup.children.length <= 2)
  {
   let mainmenu = document.getElementById("liveclick-mainmenu");
   for (let i = 0; i < mainmenu.children.length; i++)
   {
    let mnuItem = mainmenu.childNodes[i].cloneNode(false);
    // Default command is executed on all tbb commands unless we prevent it
    if (popup.id == "liveclick-tbb-menu")
    {
     mnuItem.addEventListener("command",
      function (event) { event.stopPropagation(); }, false);
    }
    popup.appendChild(this.toggleItem(mnuItem));
   }
   return;
  }
  // Update menu items based on check/suspend status
  for (let i = 0; i < popup.children.length; i++)
  {
   let mnuItem = popup.childNodes[i];
   this.toggleItem(mnuItem);
  }
 },
 toggleItem : function (aElement)
 {
  let sCommand = aElement.getAttribute("command");
  if (sCommand == "") return aElement;
  let bAutoCheck = LiveClickPrefs.getValue("checkAutomatic");
  // Toggle check/stop items if check in progress
  if (sCommand == "LiveClick:CheckAll")
  {
   if (LiveClickPlaces.isChecking)
    aElement.setAttribute("collapsed", true);
   else
    aElement.removeAttribute("collapsed");
  }
  else if (sCommand == "LiveClick:StopCheck")
  {
   if (LiveClickPlaces.isChecking)
    aElement.removeAttribute("collapsed");
   else
    aElement.setAttribute("collapsed", true);
  }
  // Checkmark if auto checking on, hide if disabled
  else if (sCommand == "LiveClick:ToggleSuspend")
  {
   if (!bAutoCheck || LiveClick.isSuspended)
    aElement.setAttribute("checked", true);
   else
    aElement.removeAttribute("checked");
   if (!bAutoCheck)
    aElement.setAttribute("collapsed", true);
   else
    aElement.removeAttribute("collapsed");
  }
  return aElement;
 },
 setStatus : function (aStatus, aValue)
 {
  let bm = document.getElementById("liveclick-bookmarks-menu");
  if (bm) bm.setAttribute(aStatus, aValue);
  let abm = document.getElementById("liveclick-app-bookmarks-menu");
  if (abm) abm.setAttribute(aStatus, aValue);
  let bmb = document.getElementById("liveclick-bookmarks-menu-button");
  if (bmb) bmb.setAttribute(aStatus, aValue);
  let tbb = document.getElementById("liveclick-tbb");
  if (tbb)
  {
   tbb.setAttribute(aStatus, aValue);
   if (aStatus == "throbbing")
    tbb.setAttribute("tooltiptext", tbb.getAttribute("textalt"));
  }
 },
 removeStatus : function (aStatus)
 {
  let bm = document.getElementById("liveclick-bookmarks-menu");
  if (bm) bm.removeAttribute(aStatus);
  let abm = document.getElementById("liveclick-app-bookmarks-menu");
  if (abm) abm.removeAttribute(aStatus);
  let bmb = document.getElementById("liveclick-bookmarks-menu-button");
  if (bmb) bmb.removeAttribute(aStatus);
  let tbb = document.getElementById("liveclick-tbb");
  if (tbb)
  {
   tbb.removeAttribute(aStatus);
   if (aStatus == "throbbing")
    tbb.setAttribute("tooltiptext", tbb.getAttribute("textdefault"));
  }
 }
}

window.addEventListener("load", function() { LiveClickChrome.Browser.init(); }, false);