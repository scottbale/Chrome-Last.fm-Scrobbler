
/*
 * Chrome-Last.fm-Scrobbler amazon.com "new interface" Connector
 *
 * Jacob Tolar --- http://sheckel.net --- jacob[at]sheckel[dot]net
 *
 * Derived from Pandora module by Jordan Perr
 */

/********* Configuration: ***********/

// changes to the DOM in this container will trigger an update.
LFM_WATCHED_CONTAINER = "div.nowPlayingDetail";

// changes to the DOM in this container are due to play/pause/forward/back
LFM_PLAYER_MASTER_CONTROL = "div.mp3Player-MasterControl";

// function that returns title of current song
function LFM_TRACK_TITLE() {
  return $(".currentSongDetails .title").text();
}

// function that returns artist of current song
function LFM_TRACK_ARTIST() {
  // substring(3) because format is: 'by Artist'
  return $(".currentSongDetails .title").next().text().substring(3);
}

function LFM_CURRENT_TIME () {
  timeArr = $(".currentSongStatus .timer #currentTime").html().split(":");
  return parseInt(timeArr[0])*60 + parseInt(timeArr[1]);
}

// function that returns duration of current song in seconds
// called at begining of song
function LFM_TRACK_DURATION() {
  durationArr = $(".currentSongStatus .timer").children().filter(":last").html().split(":");
  return parseInt(durationArr[0])*60 + parseInt(durationArr[1]);
}

function isPaused() {
  return $("div.mp3MasterPlayGroup").hasClass("paused");
}

function isPlaying() {
  return $("div.mp3MasterPlayGroup").hasClass("playing");
}


/********* Connector: ***********/

var track = function(title, artist) {
  return title + " " + artist;
}

var songTrack = function (song) {
  return track (song.title, song.artist);
}

var module = function() {

  var resetState = function (track) {
    return {
      lastTrack : track,
      lock : false,
      scrobbled : false
    }
  }

  var initState = function() {
    return resetState ("");
  }

  // encapsulate some "private" state and functions
  var state = initState();

  var parseNewState = function() {
    var t = LFM_TRACK_TITLE();
    var a = LFM_TRACK_ARTIST();
    return {
      title : t,
      artist : a,
      currentTime : LFM_CURRENT_TIME(),
      duration : LFM_TRACK_DURATION(),
      track : track (t, a)
    }
  }

  var maybeScrobbled = function (scrobbledSong) {
    console.log ("maybe scrobbled: " + songTrack (scrobbledSong) + " ?= " + state.lastTrack);
    if (state.lastTrack == songTrack (scrobbledSong)) {
      state.scrobbled = true;
      console.log ("yes, scrobbled");
    } else {
      console.log ("nope");
    }
  }

  var update = function(newState) {
    console.log("submitting a now playing request. artist: "+newState.artist+", title: "+newState.title+", current time: "+newState.currentTime+", duration: "+newState.duration);
    chrome.extension.sendRequest({type: 'validate', artist: newState.artist, track: newState.title}, function(response) {
      if (response != false) {
	chrome.extension.sendRequest({type: 'nowPlaying', artist: newState.artist, track: newState.title, currentTime:newState.currentTime, duration: newState.duration});
      } else { // on failure send nowPlaying 'unknown song'
	chrome.extension.sendRequest({type: 'nowPlaying', duration: newState.duration});
      }
    });
    state = resetState (newState.track);
  }

  var isReadyToUpdate = function(newState) {
    return (isPlaying() && 
            newState.currentTime >= 0 && 
            newState.duration > 0 && 
            newState.track != "" && 
            newState.track != state.lastTrack);
  }

  var maybeUpdate = function() {
    var newState = parseNewState();
    if (isReadyToUpdate(newState)) {
      update(newState);
    } else {
      setTimeout(maybeUpdate, 1000);
    }
  }

  var cancelAndReset = function(force) {
    if (force || !(state.scrobbled)) {
      console.log ("resetting...")
      clearTimeout();
      state = initState();
      chrome.extension.sendRequest({type: "reset"});
    }
  }

  var updateIfNotLocked = function() {
    if (!state.lock) {
      state.lock = true;
      setTimeout(maybeUpdate, 2000);
    }
  }

  // Here is the "public" API
  return {
    updateNowPlaying : function() {
      updateIfNotLocked();
    },
    pause : function() {
      cancelAndReset(false);
    },
    resume : function() {
      this.updateNowPlaying();
    },
    reset : function() {
      cancelAndReset(true);
    },
    // Handle confirmation from main scrobbler.js
    scrobbled : function (song) {
      maybeScrobbled (song);
    }
  }
}();

/**
 * Listen for requests from scrobbler.js
 */
chrome.extension.onRequest.addListener(
  function(request, sender, sendResponse) {
    switch(request.type) {
    case 'submitOK':
      // translate song from scrobbler.js to amazon.js - TODO Clean
      // this up re: "title" versus "track" confusion
      var amazonSong = {artist: request.song.artist, title: request.song.track};
      console.log ("got submitOK for song: " + songTrack (amazonSong));
      module.scrobbled (amazonSong);
      break;

    // not used yet
    case 'submitFAIL':
      console.log ("got submitFAIL");
      //alert('submit fail');
      break;
    }
  }
);


// Run at startup
$(function(){
  console.log("Amazon module starting up");

  $(LFM_WATCHED_CONTAINER).live('DOMSubtreeModified', function(e) {
    //console.log("Live watcher called");
    if ($(LFM_WATCHED_CONTAINER).length > 0) {
      module.updateNowPlaying();
      return;
    }
  });

  $(LFM_PLAYER_MASTER_CONTROL).click( function(e) {
    if (isPaused()) {
      console.log("paused");
      module.pause();
    } else if (isPlaying()) {
      console.log("unpaused");
      module.resume();
    }
    return;
  });

  $(window).unload(function() {
    module.reset();
    return true;
  });
});
