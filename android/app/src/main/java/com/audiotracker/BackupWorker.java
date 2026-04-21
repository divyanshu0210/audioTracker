package com.audiotracker;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.audiotracker.backup.BackupEngine;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class BackupWorker extends Worker {

    public BackupWorker(
            @NonNull Context context,
            @NonNull WorkerParameters params
    ) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {

        Log.d("BackupWorker","Worker started");

        try {

            BackupEngine engine =
                    new BackupEngine(getApplicationContext());

            engine.performBackup();

            Log.d("BackupWorker","Backup finished");

            emitEventToReact("backupCompleted");

            return Result.success();

        } catch (Exception e) {

            Log.e("BackupWorker","Backup failed",e);

            return Result.retry();
        }
    }

    private void emitEventToReact(String eventName) {

        try {

            ReactApplication reactApplication =
                    (ReactApplication) getApplicationContext();

            ReactInstanceManager manager =
                    reactApplication
                            .getReactNativeHost()
                            .getReactInstanceManager();

            ReactContext reactContext =
                    manager.getCurrentReactContext();

            if (reactContext != null) {

                reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit(eventName, null);

                Log.d("BackupWorker","Event emitted to React");

            } else {

                Log.d("BackupWorker","React context not active, skipping event");

            }

        } catch (Exception e) {

            Log.e("BackupWorker","Failed emitting event",e);

        }
    }
}