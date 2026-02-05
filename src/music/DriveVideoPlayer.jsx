import React from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import Video from 'react-native-video';

const { width } = Dimensions.get('window');

const DriveVideoPlayer = () => {
  const driveFileId = "1ATdKoJP-sY85znS-gOYHel_OwlvIq7O_";
  const driveFileId2 = "1r2Jyq2s1vwsgS87f0htI-aE0jIcDsUhd";
  const driveFileId3 = "1rA_qmZIrOtrL6a4aPEl0K_veLcHzu4FK";
  const driveStreamUrl = `https://drive.google.com/uc?export=download&id=${driveFileId}`;

  return (
    <View style={styles.container}>
      <Video
        source={{ uri: 'https://youtube.googleapis.com/embed/?status=ok&amp;hl=en_US&amp;allow_embed=0&amp;ps=docs&amp;partnerid=30&amp;autoplay=0&amp;abd=0&amp;docid=1ATdKoJP-sY85znS-gOYHel_OwlvIq7O_&amp;el=leaf&amp;title=20210418_084436.mp4&amp;BASE_URL=https%3A%2F%2Fdrive.google.com%2F&amp;iurl=https%3A%2F%2Flh3.googleusercontent.com%2Fdrive-storage%2FAJQWtBOuOYxaWQ0WY9BQNFl4PXoq4XqThk16XL9WXcajvy1ghXo_tFoDS_zqRHKF8QCNsw_KqnaSGlZ0YKUtqYE-Ps75XFHztzzGM9A14Q%3Ds512&amp;cc3_module=1&amp;reportabuseurl=https%3A%2F%2Fdrive.google.com%2Fabuse%3Fid%3D1ATdKoJP-sY85znS-gOYHel_OwlvIq7O_&amp;token=1&amp;plid=V0QYOEAW1iJdww&amp;timestamp=1745215324378&amp;length_seconds=49&amp;player_response=%7B%22streamingData%22%3A%7B%22adaptiveFormats%22%3A%5B%7B%22approxDurationMs%22%3A%2249533%22%2C%22bitrate%22%3A352860%2C%22contentLength%22%3A%222061702%22%2C%22fps%22%3A30%2C%22height%22%3A426%2C%22highReplication%22%3Atrue%2C%22indexRange%22%3A%7B%22end%22%3A%22855%22%2C%22start%22%3A%22704%22%7D%2C%22initRange%22%3A%7B%22end%22%3A%22703%22%2C%22start%22%3A%220%22%7D%2C%22itag%22%3A134%2C%22lastModified%22%3A%221745212572598163%22%2C%22mimeType%22%3A%22video%2Fmp4%3B%20codecs%3D%5C%22avc1.42C015%5C%22%22%2C%22projectionType%22%3A%22RECTANGULAR%22%2C%22quality%22%3A%22small%22%2C%22qualityLabel%22%3A%22240p%22%2C%22url%22%3A%22https%3A%2F%2Frr5---sn-cvh76nlz.c.drive.google.com%2Fvideoplayback%3Fexpire%3D1745226124%5Cu0026ei%3DXN8FaJ_qF9y3mvUP9_3A-AM%5Cu0026ip%3D14.140.80.228%5Cu0026id%3D0cc65cf188a10b4a%5Cu0026itag%3D134%5Cu0026source%3Dwebdrive%5Cu0026requiressl%3Dyes%5Cu0026xpc%3DEghonaK1InoBAQ%3D%3D%5Cu0026met%3D1745215324%2C%5Cu0026mh%3D6v%5Cu0026mm%3D32%2C26%5Cu0026mn%3Dsn-cvh76nlz%2Csn-h5576nsk%5Cu0026ms%3Dsu%2Conr%5Cu0026mv%3Du%5Cu0026mvi%3D5%5Cu0026pl%3D23%5Cu0026rms%3Dsu%2Csu%5Cu0026ttl%3Dtransient%5Cu0026susc%3Ddr%5Cu0026driveid%3D1ATdKoJP-sY85znS-gOYHel_OwlvIq7O_%5Cu0026app%3Dexplorer%5Cu0026eaua%3D5Rv60Ldb-3U%5Cu0026mime%3Dvideo%2Fmp4%5Cu0026vprv%3D1%5Cu0026prv%3D1%5Cu0026rqh%3D1%5Cu0026gir%3Dyes%5Cu0026clen%3D2061702%5Cu0026dur%3D49.533%5Cu0026lmt%3D1745212572598163%5Cu0026mt%3D1745213825%5Cu0026fvip%3D1%5Cu0026subapp%3DDRIVE_WEB_FILE_VIEWER%5Cu0026txp%3D0000224%5Cu0026sparams%3Dexpire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cxpc%2Cttl%2Csusc%2Cdriveid%2Capp%2Ceaua%2Cmime%2Cvprv%2Cprv%2Crqh%2Cgir%2Cclen%2Cdur%2Clmt%5Cu0026sig%3DAJfQdSswRgIhAI7gxvFw6TAICxKqTJAK5Z5kzadwg-0bnhAEwOQNxXiCAiEAnCzL1tEgfrFg22ceavnruJKjzCVWkBuQK-v8yEsAnr4%3D%5Cu0026lsparams%3Dmet%2Cmh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Crms%5Cu0026lsig%3DACuhMU0wRgIhAOoCsWIb_dwqbMFKk0VCPbeswZIrasjmVQIDpHJzQdvFAiEA5ddoJT1VwFB30lh5WsJvst-RkpDpifY3-Hft_Bj9oEw%3D%22%2C%22width%22%3A240%7D%2C%7B%22approxDurationMs%22%3A%2249574%22%2C%22audioQuality%22%3A%22AUDIO_QUALITY_MEDIUM%22%2C%22bitrate%22%3A130373%2C%22contentLength%22%3A%22803474%22%2C%22highReplication%22%3Atrue%2C%22indexRange%22%3A%7B%22end%22%3A%22814%22%2C%22start%22%3A%22723%22%7D%2C%22initRange%22%3A%7B%22end%22%3A%22722%22%2C%22start%22%3A%220%22%7D%2C%22itag%22%3A140%2C%22lastModified%22%3A%221745212177981314%22%2C%22mimeType%22%3A%22audio%2Fmp4%3B%20codecs%3D%5C%22mp4a.40.2%5C%22%22%2C%22projectionType%22%3A%22RECTANGULAR%22%2C%22quality%22%3A%22tiny%22%2C%22url%22%3A%22https%3A%2F%2Frr5---sn-cvh76nlz.c.drive.google.com%2Fvideoplayback%3Fexpire%3D1745226124%5Cu0026ei%3DXN8FaJ_qF9y3mvUP9_3A-AM%5Cu0026ip%3D14.140.80.228%5Cu0026id%3D0cc65cf188a10b4a%5Cu0026itag%3D140%5Cu0026source%3Dwebdrive%5Cu0026requiressl%3Dyes%5Cu0026xpc%3DEghonaK1InoBAQ%3D%3D%5Cu0026met%3D1745215324%2C%5Cu0026mh%3D6v%5Cu0026mm%3D32%2C26%5Cu0026mn%3Dsn-cvh76nlz%2Csn-h5576nsk%5Cu0026ms%3Dsu%2Conr%5Cu0026mv%3Du%5Cu0026mvi%3D5%5Cu0026pl%3D23%5Cu0026rms%3Dsu%2Csu%5Cu0026ttl%3Dtransient%5Cu0026susc%3Ddr%5Cu0026driveid%3D1ATdKoJP-sY85znS-gOYHel_OwlvIq7O_%5Cu0026app%3Dexplorer%5Cu0026eaua%3D5Rv60Ldb-3U%5Cu0026mime%3Daudio%2Fmp4%5Cu0026vprv%3D1%5Cu0026prv%3D1%5Cu0026rqh%3D1%5Cu0026gir%3Dyes%5Cu0026clen%3D803474%5Cu0026dur%3D49.574%5Cu0026lmt%3D1745212177981314%5Cu0026mt%3D1745213825%5Cu0026fvip%3D1%5Cu0026subapp%3DDRIVE_WEB_FILE_VIEWER%5Cu0026txp%3D0000224%5Cu0026sparams%3Dexpire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cxpc%2Cttl%2Csusc%2Cdriveid%2Capp%2Ceaua%2Cmime%2Cvprv%2Cprv%2Crqh%2Cgir%2Cclen%2Cdur%2Clmt%5Cu0026sig%3DAJfQdSswRgIhAM6PzjfRt5cTP9jDE1vUG_fmthh8fGqdIpixMNfeYi6OAiEAuDka7iXPCIvtb_RF7QqM1002hBcAQsypjE00qACF1Bw%3D%5Cu0026lsparams%3Dmet%2Cmh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Crms%5Cu0026lsig%3DACuhMU0wRAIgb-Zx2knnIZkzDvqXq93B-fmRpIkBlJX5e5IWlIXKNtgCIC-WIxGLx5TkzoleyZxldRjyTe6MkLPxrbD6B5Fr4rRm%22%7D%5D%2C%22formats%22%3A%5B%7B%22approxDurationMs%22%3A%2249574%22%2C%22audioQuality%22%3A%22AUDIO_QUALITY_LOW%22%2C%22bitrate%22%3A461641%2C%22contentLength%22%3A%2216751%22%2C%22fps%22%3A30%2C%22height%22%3A426%2C%22itag%22%3A18%2C%22lastModified%22%3A%221745212620799849%22%2C%22mimeType%22%3A%22video%2Fmp4%3B%20codecs%3D%5C%22avc1.4D001F%5C%22%22%2C%22projectionType%22%3A%22RECTANGULAR%22%2C%22quality%22%3A%22small%22%2C%22qualityLabel%22%3A%22240p%22%2C%22url%22%3A%22https%3A%2F%2Frr5---sn-cvh76nlz.c.drive.google.com%2Fvideoplayback%3Fexpire%3D1745226124%5Cu0026ei%3DXN8FaJ_qF9y3mvUP9_3A-AM%5Cu0026ip%3D14.140.80.228%5Cu0026id%3D0cc65cf188a10b4a%5Cu0026itag%3D18%5Cu0026source%3Dwebdrive%5Cu0026requiressl%3Dyes%5Cu0026xpc%3DEghonaK1InoBAQ%3D%3D%5Cu0026met%3D1745215324%2C%5Cu0026mh%3D6v%5Cu0026mm%3D32%2C26%5Cu0026mn%3Dsn-cvh76nlz%2Csn-h5576nsk%5Cu0026ms%3Dsu%2Conr%5Cu0026mv%3Du%5Cu0026mvi%3D5%5Cu0026pl%3D23%5Cu0026rms%3Dsu%2Csu%5Cu0026ttl%3Dtransient%5Cu0026susc%3Ddr%5Cu0026driveid%3D1ATdKoJP-sY85znS-gOYHel_OwlvIq7O_%5Cu0026app%3Dexplorer%5Cu0026eaua%3D5Rv60Ldb-3U%5Cu0026mime%3Dvideo%2Fmp4%5Cu0026vprv%3D1%5Cu0026prv%3D1%5Cu0026rqh%3D1%5Cu0026cnr%3D14%5Cu0026dur%3D49.574%5Cu0026lmt%3D1745212620799849%5Cu0026mt%3D1745213825%5Cu0026fvip%3D1%5Cu0026subapp%3DDRIVE_WEB_FILE_VIEWER%5Cu0026txp%3D0001224%5Cu0026sparams%3Dexpire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cxpc%2Cttl%2Csusc%2Cdriveid%2Capp%2Ceaua%2Cmime%2Cvprv%2Cprv%2Crqh%2Ccnr%2Cdur%2Clmt%5Cu0026sig%3DAJfQdSswRgIhAJAKrWen7HAHEsPMCMiAk1C0ObNQBVCB2iQGFythHgTvAiEA0ueH4r10BvzQpvYnqP1LaUEDxmZay5ROFcRNvOJTevE%3D%5Cu0026lsparams%3Dmet%2Cmh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Crms%5Cu0026lsig%3DACuhMU0wRAIgUQBUNCAZOyknvyYdVAgDpbllgK3GLt1FDEgMYvWHSFoCIFqg69DHbCitBlq1Pbl7SmI6TodQTRYeYaZWXIpuaTDU%22%2C%22width%22%3A240%7D%5D%7D%7D&amp;BASE_YT_URL=https%3A%2F%2Fdrive.google.com%2F&amp;cc_load_policy=1&amp;authuser=0&amp;wmode=window&amp;override_hl=1&amp;enablecastapi=0&amp;use_native_controls=0&amp;pipable=1&amp;enablepostapi=1&amp;postid=drive-viewer-video-player-object-0&amp;origin=https%3A%2F%2Fdrive.google.com' }}
        controls
        resizeMode="contain"
        style={styles.video}
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: 50000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000
        }}
        onBuffer={() => console.log("Buffering...")}
        onError={(err) => console.log("Video Error: ", err)}
        onLoad={() => console.log("Video Loaded")}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center'
  },
  video: {
    width: width,
    height: 250
  }
});

export default DriveVideoPlayer;
