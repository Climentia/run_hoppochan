import glob
from PIL import Image, ImageDraw, ImageFilter


def GIF_MAKE():
    try:
        pathlist = glob.glob("./street_view/pic/*")
        picPathList = []
        for i in range(len(pathlist)):
            picPathList.append("./street_view/pic/streetview" + str(i) + ".png")
            images = []
        for picPath in picPathList:
            tmp = Image.open(picPath)
            images.append(tmp)
            file_name = "./data/route"
            images[0].save(file_name+'.gif', save_all=True, append_images=images[1:], optimize=False, duration=70, loop=0)
        return 0
    except Exception as e:
        txt = "error:" + e
        return txt
