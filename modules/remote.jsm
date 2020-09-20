/* LiveClickRemote deals with direct places database manipulation */
var EXPORTED_SYMBOLS = ["LiveClickRemote", "LC_EXPIRE_NEVER"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

// Import Firefox modules
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// Constants
const LC_EXPIRE_SESSION = 0;
const LC_EXPIRE_WEEKS = 2;
const LC_EXPIRE_MONTHS = 3;
const LC_EXPIRE_NEVER = 4;
const LC_EXPIRE_WITH_HISTORY = 5;
const LC_EXPIRE_DAYS = 6;

// 1 day = 86400000 = 24*60*60*1000 ms
//	Others: 259200000 (3 days), 604800000 (7 days)
const LC_TTL = 604800000;

var LiveClickRemote =
{
	// Private Variables
	_tokenIds : { expiration: null, custom_interval: null,
					monitored: null, custom_monitor: null,
					custom_feed: null, custom_site: null,
					custom_max: null, loading: null, loadfailed: null },

	init : function ()
	{
		function createTable (aTableName)
		{
			if (db.tableExists("liveclick_" + aTableName))
				return;

			if (aTableName == "pages")
				db.createTable("liveclick_pages",
								"id INTEGER PRIMARY KEY, url LONGVARCHAR NOT NULL," +
								" parent INTEGER, position INTEGER DEFAULT 0," +
								" title LONGVARCHAR, preview LONGVARCHAR, state VARCHAR(6)," +
								" lastSeen INTEGER, proxy_id INTEGER DEFAULT 0");

			if (aTableName == "proxies")
				db.createTable("liveclick_proxies",
								"id INTEGER PRIMARY KEY, proxy LONGVARCHAR UNIQUE NOT NULL");

			if (aTableName == "favicons")
				db.createTable("liveclick_favicons",
								"place_id INTEGER PRIMARY KEY, icondata TEXT");
		}

		let db = LiveClickRemote._getLiveClickDB();
		createTable("pages");
		createTable("proxies");
		createTable("favicons");
	},

	_getLiveClickDB : function ()
	{
		if (!this._pagesDB)
		{
			let file = FileUtils.getFile("ProfD", ["liveclick.sqlite"]);
			this._pagesDB = Services.storage.openDatabase(file);
		}
		return this._pagesDB;
	},

	// Returns true if transaction started
	beginTransaction : function ()
	{
		let db = this._getLiveClickDB();
		if (db.transactionInProgress) return false;
		db.beginTransactionAs(db.TRANSACTION_DEFERRED);
		return true;
	},

	endTransaction : function ()
	{
		let db = this._getLiveClickDB();
		if (!db.transactionInProgress) return;
		db.commitTransaction();
	},

	getChildren : function (aParentId, aCallback)
	{
		let status = 0;
		let children = [];

		let db = this._getLiveClickDB();
		let q = "SELECT id, url, position, title, preview, state" +
				" FROM liveclick_pages" +
				" WHERE parent = :parent AND position > 0" +
				" ORDER BY position";
		let statement = db.createAsyncStatement(q);
		statement.params.parent = aParentId;
		statement.executeAsync({
			handleResult : function (aResultSet)
			{
				status = 1;
				for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow())
				{
					let item = {};
					item.id = row.getResultByName("id");
					item.url = row.getResultByName("url");
					item.position = row.getResultByName("position");
					item.title = row.getResultByName("title");
					item.preview = row.getResultByName("preview");
					item.state = row.getResultByName("state");
					children.push(item);
				}
			},

			handleError : function (aError)
			{
				logMessage(aError.message);
			},

			handleCompletion : function (aReason)
			{
				aCallback(status, children);
			}
		});
		statement.finalize();
	},

	insertChildren : function (aParentId, aItems, aCallback)
	{
		let dtNow = new Date();
		let db = this._getLiveClickDB();
		let q = "INSERT INTO liveclick_pages" +
					" (parent, url, position, title, preview, state, lastSeen)" +
				" VALUES (:parent, :url, :position, :title, :preview, :state, :seen)";
		let statement = db.createAsyncStatement(q);
		let params = statement.newBindingParamsArray();
		for (let i = 0; i < aItems.length; i++)
		{
			let bp = params.newBindingParams();
			bp.bindByName("parent", aItems[i].parent ? aItems[i].parent : aParentId);
			bp.bindByName("url", aItems[i].url);
			bp.bindByName("position", aItems[i].position);
			bp.bindByName("title", aItems[i].title);
			bp.bindByName("preview", aItems[i].preview);
			bp.bindByName("state", aItems[i].state);
			bp.bindByName("seen", dtNow.getTime() * 1000);
			params.addParams(bp);
		}
		statement.bindParameters(params);
		statement.executeAsync({
			handleResult : function (aResultSet) {},
			handleError : function (aError) { logMessage(aError.message); },
			handleCompletion : function (aReason)
			{
				if (aCallback) aCallback(aReason, aItems.length);
			}
		});
		statement.finalize();
	},

	updateChildren : function (aParentId, aItems, aBaseIndex, aCallback)
	{
		let dtNow = new Date();
		let db = this._getLiveClickDB();
		let q = "UPDATE liveclick_pages" +
				" SET position = :position, title = :title, preview = :preview, lastSeen = :seen" +
				" WHERE id = :id";
		let statement = db.createAsyncStatement(q);
		let params = statement.newBindingParamsArray();
		for (let i = 0; i < aItems.length; i++)
		{
			let bp = params.newBindingParams();
			bp.bindByName("id", aItems[i].id);
			bp.bindByName("position", aBaseIndex + aItems[i].position);
			bp.bindByName("title", aItems[i].title);
			bp.bindByName("preview", aItems[i].preview);
			bp.bindByName("seen", dtNow.getTime() * 1000);
			params.addParams(bp);
		}
		statement.bindParameters(params);
		statement.executeAsync({
			handleResult : function (aResultSet) {},
			handleError : function (aError) { logMessage(aError.message); },
			handleCompletion : function (aReason)
			{
				if (aCallback) aCallback(aReason, aItems.length);
			}
		});
		statement.finalize();
	},

	orphanChildren : function (aParentId)
	{
		let db = this._getLiveClickDB();
		let q = "UPDATE liveclick_pages" +
				" SET position = 0" +
				" WHERE parent = :parent";
		let statement = db.createAsyncStatement(q);
		statement.params.parent = aParentId;
		statement.executeAsync();
		statement.finalize();
	},

	// Perform live bookmark item state changes en masse
	//	stateFrom = '' ? Insert/replace all items of given feed
	changeChildrenStates : function (aParentId, aStateFrom, aStateTo)
	{
		let db = this._getLiveClickDB();
		let q = "UPDATE liveclick_pages" +
				" SET state = :state_to" +
				" WHERE parent = :parent" +
					" AND (:state_from = '' OR state = :state_from)";
		let statement = db.createAsyncStatement(q);
		statement.params.parent = aParentId;
		statement.params.state_from = aStateFrom;
		statement.params.state_to = aStateTo;
		statement.executeAsync();
		statement.finalize();
	},

	setPageState : function (aPageId, aState)
	{
		let db = this._getLiveClickDB();
		let q = "UPDATE liveclick_pages" +
				" SET state = :state" +
				" WHERE id = :id";
		let statement = db.createAsyncStatement(q);
		statement.params.id = aPageId;
		statement.params.state = aState;
		statement.executeAsync();
		statement.finalize();
	},

	getPageState : function (aPageId)
	{
		let db = this._getLiveClickDB();
		let q = "SELECT state FROM liveclick_pages WHERE id = :id";
		let statement = db.createStatement(q);
		statement.params.id = aPageId;

		let sState = "unknown";
		try
		{
			if (statement.executeStep())
				sState = statement.getString(0);
		}
		finally
		{
			statement.reset();
			statement.finalize();
		}
		return sState;
	},

	getPageStateByURL : function (aURL)
	{
		let db = this._getLiveClickDB();
		let q = "SELECT state FROM liveclick_pages" +
				" LEFT JOIN liveclick_proxies ON liveclick_proxies.id = liveclick_pages.proxy_id" +
				" WHERE url = :url OR proxy = :url";
		let statement = db.createStatement(q);
		statement.params.url = aURL;

		let sState = "unknown";
		try
		{
			if (statement.executeStep())
				sState = statement.getString(0);
		}
		finally
		{
			statement.reset();
			statement.finalize();
		}
		return sState;
	},

	getPageParent : function (aPageId)
	{
		let db = this._getLiveClickDB();
		let q = "SELECT parent FROM liveclick_pages WHERE id = :id";
		let statement = db.createStatement(q);
		statement.params.id = aPageId;

		let iParent = -1;
		try
		{
			if (statement.executeStep())
				iParent = statement.getInt64(0);
		}
		finally
		{
			statement.reset();
			statement.finalize();
		}
		return iParent;
	},

	getPagePreview : function (aPageId)
	{
		let db = this._getLiveClickDB();
		let q = "SELECT preview FROM liveclick_pages WHERE id = :id";
		let statement = db.createStatement(q);
		statement.params.id = aPageId;

		let sPreview = "";
		try
		{
			if (statement.executeStep())
				sPreview = statement.getString(0);
		}
		finally
		{
			statement.reset();
			statement.finalize();
		}
		return sPreview;
	},

	getPageURL : function (aPageId)
	{
		let db = this._getLiveClickDB();
		let q = "SELECT url FROM liveclick_pages WHERE id = :id";
		let statement = db.createStatement(q);
		statement.params.id = aPageId;

		let sURL = "";
		try
		{
			if (statement.executeStep())
				sURL = statement.getString(0);
		}
		finally
		{
			statement.reset();
			statement.finalize();
		}
		return sURL;
	},

	getPagesByURL : function (aURL, aCallback)
	{
		let db = this._getLiveClickDB();
		let q = "SELECT liveclick_pages.id FROM liveclick_pages" +
				" LEFT JOIN liveclick_proxies ON liveclick_proxies.id = liveclick_pages.proxy_id" +
				" WHERE url = :url OR proxy = :url";
		let statement = db.createAsyncStatement(q);
		statement.params.url = aURL;
		statement.executeAsync({
			handleResult : function (aResultSet)
			{
				let pages = [];
				for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow())
					pages.push(row.getResultByName("id"));
				aCallback(pages);
			},
			handleError : function () {},
			handleCompletion : function () {}
		});
		statement.finalize();
	},

	insertProxies : function (aItems)
	{
		let db = this._getLiveClickDB();
		let q = "INSERT INTO liveclick_proxies (proxy)" +
				" SELECT :proxy WHERE NOT EXISTS" +
					" (SELECT proxy FROM liveclick_proxies WHERE proxy = :proxy)";
		let statement = db.createAsyncStatement(q);
		let params = statement.newBindingParamsArray();
		for (let i = 0; i < aItems.length; i++)
		{
			let bp = params.newBindingParams();
			bp.bindByName("proxy", aItems[i].proxy);
			params.addParams(bp);
		}
		statement.bindParameters(params);
		statement.executeAsync();
		statement.finalize();

		q = "UPDATE liveclick_pages" +
			" SET proxy_id = (SELECT id FROM liveclick_proxies WHERE proxy = :proxy)" +
			" WHERE url = :url";
		statement = db.createAsyncStatement(q);
		params = statement.newBindingParamsArray();
		for (let i = 0; i < aItems.length; i++)
		{
			let bp = params.newBindingParams();
			bp.bindByName("proxy", aItems[i].proxy);
			bp.bindByName("url", aItems[i].url);
			params.addParams(bp);
		}
		statement.bindParameters(params);
		statement.executeAsync();
		statement.finalize();
	},

	// Delete pages that are:
	//	1) No longer listed (position = 0)
	//	2) Last modified over # days ago (# defined as TTL)
	clearOrphans : function ()
	{
		let dtNow = new Date();
		let db = this._getLiveClickDB();
		let q = "DELETE FROM liveclick_pages" +
				" WHERE position = 0 AND lastSeen < :dtLast";
		let statement = db.createAsyncStatement(q);
		statement.params.dtLast = (dtNow - LC_TTL) * 1000;
		statement.executeAsync();
		statement.finalize();
	},

	clearOrphanProxies : function ()
	{
		let dtNow = new Date();
		let db = this._getLiveClickDB();
		let q = "DELETE FROM liveclick_proxies" +
				" WHERE id NOT IN (SELECT proxy_id FROM liveclick_pages WHERE proxy_id > 0)";
		let statement = db.createAsyncStatement(q);
		statement.executeAsync();
		statement.finalize();
	},

	// Delete pages in a given array
	//	aPageIds = [] ? Delete all pages
	clearPages : function (aPageIds)
	{
		let sIds = aPageIds.join(",");
		let db = this._getLiveClickDB();
		let q = "DELETE FROM liveclick_pages" +
				" WHERE '" + sIds + "' = '' OR id IN (" + sIds + ")";
		let statement = db.createAsyncStatement(q);
		statement.executeAsync();
		statement.finalize();
	},

	deletePagesDB : function ()
	{
		let file = FileUtils.getFile("ProfD", ["liveclick.sqlite"]);
		try
		{
			file.remove(false);
		}
		// If file locked, at least clear tables
		catch (e)
		{
			this.clearPages([]);
			this.clearOrphanProxies();
		}
	},

	_getPlacesDB : function ()
	{
		return Cc["@mozilla.org/browser/nav-history-service;1"]
					.getService(Ci.nsPIPlacesDatabase).DBConnection;
	},

	_getTokenId : function (aToken)
	{
		let iTokenId = null;

		if (!this._tokenIds[aToken])
		{
			let sName = "liveclick/" + aToken;
			let db = this._getPlacesDB();
			let q, statement;

			q = "SELECT id FROM moz_anno_attributes WHERE name = ?1"
			statement = db.createStatement(q);
			try
			{
				statement.bindUTF8StringParameter(0, sName);
				if (statement.executeStep())
					iTokenId = statement.getInt64(0);
			}
			catch (e)
			{
				throw("Error retrieving tokenId.");
			}
			finally
			{
				statement.reset();
				statement.finalize();
			}

			if (!iTokenId)
			{
				q = "INSERT INTO moz_anno_attributes (name) VALUES (?1)";
				statement = db.createStatement(q);
				try
				{
					statement.bindUTF8StringParameter(0, sName);
					statement.execute();

					iTokenId = db.lastInsertRowID;
				}
				catch (e)
				{
					throw("Error setting tokenId.");
				}
				finally
				{
					statement.reset();
					statement.finalize();
				}
			}

			if (iTokenId) this._tokenIds[aToken] = iTokenId;
		}

		return this._tokenIds[aToken];
	},

	getNextExpire : function ()
	{
		let dtExpire = Date.now();
		let db = this._getPlacesDB();
		let q = "SELECT content FROM moz_items_annos" +
					" WHERE anno_attribute_id = ?1" +
					" ORDER BY content ASC"
		let statement = db.createStatement(q);
		try
		{
			statement.bindInt64Parameter(0, this._getTokenId("expiration"));
			if (statement.executeStep())
				dtExpire = parseInt(statement.getString(0));
		}
		catch (e) { }
		finally
		{
			statement.reset();
			statement.finalize();
		}

		return dtExpire;
	},

	setFeedToken : function (aLivemarkId, aToken, aValue)
	{
		if (aValue != "")
		{
			// Use annotations API for a single item change
			// Params: uri, name, value, flags (unimplemented), expiration
			PlacesUtils.annotations.setItemAnnotation
				(aLivemarkId, "liveclick/" + aToken, aValue, 0, LC_EXPIRE_NEVER);
		}
		else
		{
			// Remove annotation if empty string
			PlacesUtils.annotations
				.removeItemAnnotation(aLivemarkId, "liveclick/" + aToken);
		}
	},

	// Note: returns a variable of type string
	getFeedToken : function (aLivemarkId, aToken)
	{
		let value = null;
		try
		{
			value = PlacesUtils.annotations
						.getItemAnnotation(aLivemarkId, "liveclick/" + aToken);
		}
		catch(e)
		{
			// Annotation does not exist; more efficient to catch errors
			//	than to use hasAnnotation (less database overhead)
		}
		return value;
	},

	// Set batch of annotations (aData: [{ id:, content:, expire: }])
	setFeedBatch : function (aToken, aData)
	{
		if (aData.length == 0) return;

		let sName = "liveclick/" + aToken;
		let callback =
		{
			runBatched : function ()
			{
				for (let i = 0; i < aData.length; i++)
				{
					let itemId = aData[i].id;
					let content = aData[i].content;
					let expire = aData[i].expire ?
									aData[i].expire : LC_EXPIRE_SESSION;

					PlacesUtils.annotations.setItemAnnotation
						(itemId, sName, content, 0, expire);
				}
			}
		};

		PlacesUtils.bookmarks.runInBatchMode(callback, null);
	},

	// Batch update feeds with annotation (aLivemarkIds: [ids])
	setFeedsAnno : function (aLivemarkIds, aToken, aContent)
	{
		if (aLivemarkIds.length == 0) return;
		let sIds = aLivemarkIds.join(",");

		let iTokenId = this._getTokenId(aToken);
		let dtNow = new Date();
		let db = this._getPlacesDB();
		let q = "INSERT OR REPLACE INTO moz_items_annos " +
			"(item_id, anno_attribute_id, content, expiration, type, dateAdded, lastModified) " +
			"SELECT moz_bookmarks.id, ?1, ?2, ?3, 3, COALESCE(moz_items_annos.dateAdded, ?4), " +
				"CASE WHEN moz_items_annos.dateAdded ISNULL THEN 0 ELSE ?4 END " +
			"FROM moz_bookmarks " +
			"LEFT JOIN moz_items_annos ON moz_items_annos.item_id = moz_bookmarks.id " +
				"AND moz_items_annos.anno_attribute_id = ?1 " +
			"WHERE moz_bookmarks.id IN (" + sIds + ")";
		let statement = db.createAsyncStatement(q);
		statement.bindInt64Parameter(0, iTokenId);
		statement.bindUTF8StringParameter(1, aContent);
		statement.bindInt32Parameter(2, LC_EXPIRE_NEVER);
		statement.bindInt64Parameter(3, dtNow.getTime() * 1000);
		statement.executeAsync();
		statement.finalize();
	},

	// Batch delete annotation from feeds (aLivemarkIds: [ids])
	//	aLivemarkIds = [] ? Delete anno from all feeds
	clearFeedsAnno : function (aLivemarkIds, aToken)
	{
		let sIds = aLivemarkIds.join(",");
		let iTokenId = this._getTokenId(aToken);
		let db = this._getPlacesDB();
		let q = "DELETE FROM moz_items_annos" +
				" WHERE anno_attribute_id = ?1" +
					" AND ('" + sIds + "' = '' OR item_id IN (" + sIds + "))";
		let statement = db.createAsyncStatement(q);
		statement.bindInt64Parameter(0, iTokenId);
		statement.executeAsync();
		statement.finalize();
	},

	purgeLiveClickAnnos : function ()
	{
		for (let anno in this._tokenIds)
			this.clearFeedsAnno([], anno);

		let db = this._getPlacesDB();
		let q = "DELETE FROM moz_anno_attributes" +
				" WHERE name LIKE 'liveclick/%'";
		let statement = db.createAsyncStatement(q);
		statement.executeAsync();
		statement.finalize();
	},

	// Store favicon data string
	//	aIconData = null ? Remove favicon data
	setIconDataURL : function (aLivemarkId, aIconData)
	{
		let db = this._getLiveClickDB();
		let q;
		if (aIconData)
			q = "INSERT OR REPLACE INTO liveclick_favicons" +
					" (place_id, icondata)" +
				" VALUES (?1, ?2)";
		else
			q = "DELETE FROM liveclick_favicons" +
				" WHERE place_id = ?1";
		let statement = db.createAsyncStatement(q);
		statement.bindInt64Parameter(0, aLivemarkId);
		if (aIconData) statement.bindUTF8StringParameter(1, aIconData);
		statement.executeAsync();
		statement.finalize();
	},

	getIconDataURL : function (aLivemarkId, aCallback)
	{
		let status = 0;
		let icondata = "";

		let db = this._getLiveClickDB();
		let q = "SELECT icondata FROM liveclick_favicons" +
				" WHERE place_id = :livemarkId";
		let statement = db.createAsyncStatement(q);
		statement.params.livemarkId = aLivemarkId;
		statement.executeAsync({
			handleResult : function (aResultSet)
			{
				status = 1;
				for (let row = aResultSet.getNextRow(); row; row = aResultSet.getNextRow())
					icondata = row.getResultByName("icondata");
			},

			handleError : function (aError)
			{
				logMessage(aError.message);
			},

			handleCompletion : function (aReason)
			{
				aCallback(status, icondata);
			}
		});
		statement.finalize();
	}
}

function logMessage (aMessage)
{
	Cc["@mozilla.org/observer-service;1"]
		.getService(Ci.nsIObserverService)
		.notifyObservers(null, "liveclick-logging", aMessage);
}