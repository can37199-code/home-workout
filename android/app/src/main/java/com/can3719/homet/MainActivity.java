package com.can3719.homet;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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

    // 상태 표시줄·내비게이션 바 뒤 영역을 화면 색에 맞춘다 (운동 화면은 어둡게, 테마에 따라 밝게/어둡게)
    @CapacitorPlugin(name = "SystemUi")
    public static class SystemUiPlugin extends Plugin {
        @PluginMethod
        public void setColor(PluginCall call) {
            String color = call.getString("color", "#111213");
            boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", true));
            getActivity().runOnUiThread(() -> {
                int c = Color.parseColor(color);
                View decor = getActivity().getWindow().getDecorView();
                decor.setBackgroundColor(c);
                View web = getBridge().getWebView();
                if (web.getParent() instanceof View) ((View) web.getParent()).setBackgroundColor(c);
                web.setBackgroundColor(c);
                WindowInsetsControllerCompat ctl = WindowCompat.getInsetsController(getActivity().getWindow(), decor);
                ctl.setAppearanceLightStatusBars(!dark);
                ctl.setAppearanceLightNavigationBars(!dark);
            });
            call.resolve();
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KeepAwakePlugin.class);
        registerPlugin(SystemUiPlugin.class);
        super.onCreate(savedInstanceState);
        // 음성 안내와 영상이 터치 없이도 이어서 재생되게
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
