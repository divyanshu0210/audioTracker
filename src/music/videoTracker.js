import { saveWatchProgress } from "../database/C";
import { updateWatchTimestampIfExists } from "../database/U";

class VideoTracker {
    constructor(videoId, watchTimes,intervals = [],allIntervals=[],lastWatchTime,unfltrdWatchTime =0,duration) {
        this.currentStart = null;
        this.videoId = videoId;
        this.watchTimes = watchTimes || []; // Ensure watchTimes is always an array
        this.intervals = intervals || []; // Ensure intervals is always an array
        this.allIntervals= allIntervals || [];
        this.lastWatchTime = lastWatchTime; // New field to store last pause time
        this.duration = duration;
        this.unfltrdWatchTime = unfltrdWatchTime;

        this.sessionIntervals = [];

          // Subtract the watch time of already existing `intervals` to reset the base
        // const preMergedUnfiltered = this.getTotalTrackedTime(this.intervals);
        // this.unfltrdWatchTime = (unfltrdWatchTime || 0) - preMergedUnfiltered;

        console.log(`Video Porogress Tracker Initialised VideoId: ${this.videoId},watchTimes: ${this.watchTimes} ,PrvTodayIntervals: ${this.intervals},AllIntervals: ${this.allIntervals},\nUnfilteredWatchTime: ${this.unfltrdWatchTime}`)
    }

    onPlay(currTime) {
        this.currentStart = currTime;
        console.log('start',this.currentStart)
    }

    onPause(currTime) {
        if (this.currentStart !== null) {
            this.lastWatchTime =( this.duration- currTime)<5?0:this.lastWatchTime;
            let duration = currTime - this.currentStart;
            if (duration >= 10) {
                this.sessionIntervals.push([this.currentStart, currTime]);
                console.log('new interval',this.sessionIntervals)
                // this.intervals.push([this.currentStart, currTime]);
                // console.log('new interval',this.intervals)
                //whenever user has significantly watched something update the lastWatchedTime
                this.lastWatchTime = currTime; // Store the last time user paused
            }
            this.currentStart = null; // Reset start time
            
        }
    }

    getIntervals() {
        // return this.intervals;
        return [...this.intervals, ...this.sessionIntervals];
    }

    mergeOverlappingIntervals(intervals) {
        if (!intervals || !intervals.length) return [];
        
        // Sort intervals based on the start value
        intervals.sort((a, b) => a[0] - b[0]);
        
        let resIdx = 0;
        
        for (let i = 1; i < intervals.length; i++) {
            if (intervals[resIdx][1] >= intervals[i][0]) {
                // Merge the intervals
                intervals[resIdx][1] = Math.max(intervals[resIdx][1], intervals[i][1]);
            } else {
                // Move to the next interval
                resIdx++;
                intervals[resIdx] = intervals[i];
            }
        }
        
        // Resize the array to only keep merged intervals
        intervals = intervals.slice(0, resIdx + 1);
        return intervals;
    }

    getTotalTrackedTime(intervals) {
        if (!intervals || !intervals.length) return 0;
        return intervals.reduce((sum, [start, end]) => sum + (end - start), 0);
    }

    getWatchTimeOfToday() {
        const totalTrackedTime = this.getTotalTrackedTime(this.allIntervals);
        const todayDate = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
        
        // Ensure watchTimes is a valid array
        const validWatchTimes = Array.isArray(this.watchTimes) ? this.watchTimes.filter(entry => entry && entry.date && entry.watchTime !== undefined) : [];
        
        // Sum up watch times of previous days (excluding today's date)
        const previousDaysTime = validWatchTimes
        .filter(entry => entry.date !== todayDate)
        .reduce((sum, entry) => sum + entry.watchTime, 0);
        return Math.max(0, totalTrackedTime - previousDaysTime);
    }

    async saveProgressinDB() {
        updateWatchTimestampIfExists(this.videoId);
        if (!this.sessionIntervals.length) {
            console.log('No watch progress to save.');
            return;
        }

        const newlyWatchedUnfilteredTime = this.getTotalTrackedTime(this.sessionIntervals);
        // const newlyWatchedUnfilteredTime = this.getTotalTrackedTime(this.intervals);
        this.unfltrdWatchTime += newlyWatchedUnfilteredTime;
        console.log('Updated Unfiltered Watch Time:', this.unfltrdWatchTime);

        this.intervals = [...this.intervals, ...this.sessionIntervals];
        this.sessionIntervals = []; // clear after merging

        const mergedTodayIntervals = this.mergeOverlappingIntervals(this.intervals);
        this.intervals = mergedTodayIntervals;
        console.log('Merged Today Intervals:', mergedTodayIntervals); 

        console.log('Old All Intervals:', this.allIntervals); 
        
        this.allIntervals = [...this.allIntervals , ...this.intervals]

        const mergedAllIntervals = this.mergeOverlappingIntervals(this.allIntervals);
        this.allIntervals = mergedAllIntervals;
        console.log('Merged All Intervals:', mergedAllIntervals);

        
        const todayTotalWatchTime = this.getTotalTrackedTime(this.intervals);
        console.log('Today total Watch Time:', todayTotalWatchTime);
        
        const todayNewWatchTime = this.getWatchTimeOfToday();
        console.log('Today New Watch Time:', todayNewWatchTime);
        console.log('Last Watch Time:', this.lastWatchTime);
        try {

            console.log('Saving initiated by VTracker for VideoId : ',this.videoId);
            await saveWatchProgress(this.videoId, mergedAllIntervals,mergedTodayIntervals,todayTotalWatchTime, todayNewWatchTime, Math.floor(this.lastWatchTime), this.unfltrdWatchTime);
            console.log('Watch progress saved successfully.');
        } catch (error) {
            console.error('Error saving watch progress:', error);
        }
    }
    
}

export default VideoTracker;
