package com.superdalkom.homet;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {

    // 운동 중에는 화면이 꺼지지 않게 한다 (웹뷰는 Wake Lock API를 지원하지 않는다)
    @CapacitorPlugin(name = "KeepAwake")
    public static class KeepAwakePlugin extends Plugin {
        @PluginMethod
        public void keepAwake(PluginCall call) {
            getActivity().runOnUiThread(() -> getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
            call.resolve();
        }

        @PluginMethod
        public void allowSleep(PluginCall call) {
            getActivity().runOnUiThread(() -> getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
            call.resolve();
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KeepAwakePlugin.class);
        super.onCreate(savedInstanceState);
        // 음성 안내와 영상이 터치 없이도 이어서 재생되게
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
