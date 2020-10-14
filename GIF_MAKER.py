import glob
from PIL import Image, ImageDraw, ImageFilter
# 特定のフォルダの画像をくっつけてGIFにする関数


def GIF_MAKE():
    try:
        pathlist = glob.glob("./street_view/pic/*")
        picPathList = []
        # print(pathlist)
        # 連番で画像が作られているため、何番まで読み込むか指定するだけ
        # ファイルのリストを得る
        for i in range(len(pathlist)):
            picPathList.append("./street_view/pic/streetview" + str(i) + ".png")
            images = []
            # 画像ファイルを順々に読み込んでいく
        # print(picPathList)
        for picPath in picPathList:
            # 1枚1枚のグラフを描き、appendしていく
            # ファイルが存在しない場合はスルーする
            # print(picPath)
            tmp = Image.open(picPath)
            images.append(tmp)
            # 以下の方法でくっ付けてgif化出来る
            file_name = "./data/route"
            images[0].save(file_name+'.gif', save_all=True, append_images=images[1:], optimize=False, duration=70, loop=0)
        return 0
    except Exception as e:
        txt = "error:" + e
        return txt
