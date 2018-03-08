// This captures the click on the icon in the toolbar
chrome.browserAction.onClicked.addListener(function(tab) {
    // We want to check if an Athlete Number has been provided,
    // if so lets display their results page
    chrome.storage.sync.get({
      athlete_number: ''
    }, function(items) {
        // If no athlete number has been set, load the options page
        if (items.athlete_number == '') {
            chrome.runtime.openOptionsPage();
        } else {
            results_url = "https://www.parkrun.org.uk/results/athleteeventresultshistory/?athleteNumber="+items.athlete_number+"&eventNumber=0"
            chrome.tabs.create({ url: results_url });
        }

    });

});

// The geo data will be updated when there is no data, or it is over 24 hours old
var cached_geo = {
    'data': null,
    'updated': null,
    'updating': false
}
// 24 Hours
var cached_geo_expiry_ms = 24 * 60 * 60 * 1000
// 5 Minutes
// var cached_geo_expiry_ms = 5 * 1000

function get_geo_data(notify_func) {
    now = Date()

    if (cached_geo.updated == null || ((now - cached_geo.updated) > cached_geo_expiry_ms)) {
        cached_geo.updating = true
        $.ajax({
             url: "https://www.parkrun.org.uk/wp-content/themes/parkrun/xml/geo.xml",
             success: function (result) {
                 // console.log(result)

                 var geo_data = {
                     'regions': {},
                     'events': {}
                 }

                 region_id_to_name_map = {}
                 region_name_to_id_map = {}

                 // Find all the regions
                 $(result).find('r').each(function(region_index) {
                     this_region = $(this)
                     region_name = this_region.attr('n')
                     geo_data['regions'][region_name] = {
                         "id": this_region.attr('id'),
                         "name": region_name,
                         "lat": this_region.attr('la'),
                         "lon": this_region.attr('lo'),
                         "zoom": this_region.attr('z'),
                         "parent_id": this_region.attr('pid'),
                         "child_region_ids": [],
                         "child_region_names": [],
                         "child_event_ids": [],
                         "child_event_names": [],
                         "url": this_region.attr('u')
                     }
                     region_id_to_name_map[this_region.attr('id')] = region_name
                     region_name_to_id_map[region_name] = this_region.attr('id')

                     // console.log("Looking for children of " + $(this).attr('n') )
                     // Find the children
                     this_region.children('r').each(function(child_region_index) {
                         this_child = $(this)
                         geo_data['regions'][region_name]["child_region_ids"].push(this_child.attr('id'))
                         geo_data['regions'][region_name]["child_region_names"].push(this_child.attr('n'))
                     })
                     console.log(geo_data['regions'][region_name])
                 })

                 // Find all the events
                 $(result).find('e').each(function(region_index) {
                     this_event = $(this)
                     this_event_name = this_event.attr('m')
                     this_event_region_id = this_event.attr('r')
                     geo_data['events'][this_event_name] = {
                         "shortname": this_event.attr('n'),
                         "name": this_event.attr('m'),
                         "country_id": this_event.attr('c'),
                         "region_id": this_event_region_id,
                         "id": this_event.attr('id'),
                         "lat": this_event.attr('la'),
                         "lon": this_event.attr('lo'),
                         "region_name": "unknown"
                     }

                     // Find region
                     if (this_event_region_id in region_id_to_name_map) {
                         this_event_region_name = region_id_to_name_map[this_event_region_id]
                         geo_data['events'][this_event_name]["region_name"] = this_event_region_name
                         // Store this even in the appropriate region
                         geo_data['regions'][this_event_region_name]["child_event_ids"].push(this_event.attr('id'))
                         geo_data['regions'][this_event_region_name]["child_event_names"].push(this_event_name)
                     } else {
                         console.log("Unknown region for " + JSON.stringify(geo_data['events'][this_event_name]))
                     }

                 })

                 console.log(geo_data)

                 // Update the cached data with what we have just fetched
                 cached_geo = {
                     'data': geo_data,
                     'updated': now,
                     'updating': false
                 }

                 // Send the response back via a message to whoever asked for it
                 if (notify_func !== undefined) {
                     console.log('Notifying caller with live data')
                     notify_func(cached_geo)
                 }

             },
             dataType: 'xml'
         });

     } else {
         console.log('Returning cached geo data, last updated at ' + cached_geo.updated)

         // Send the response back via a message to whoever asked for it
         if (notify_func !== undefined) {
             console.log('Notifying caller with cached data')
             notify_func(cached_geo)
         }

         return cached_geo
     }

}

  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
      console.log(sender.tab ?
                  "from a content script:" + sender.tab.url :
                  "from the extension");
      if (request.data == "geo") {
          // sendResponse({farewell: 'argh'});
        get_geo_data(function(geo_data) {
            console.log('Sending response back to the page')
            returned_data = {"geo": geo_data}
            console.log(returned_data)
            sendResponse(returned_data);
        });

        // Indicate we are going to return a response asynchronously
        // https://developer.chrome.com/extensions/runtime#event-onMessage
        return true
      }
    });
