import glob
import cv2
from PIL import Image, ImageDraw, ImageFilter


def GIF_MAKE2():
    try:
        FPS = 10      # フレームレート
        WIDTH = 640
        HEIGHT = 320
        pathlist = glob.glob("./street_view/pic/*")
        picPathList = []
        fourcc = cv2.VideoWriter_fourcc('m', 'p', '4', 'v')
        mp4_name = "./data/route.mp4"
        video = cv2.VideoWriter(mp4_name, fourcc, FPS, (WIDTH, HEIGHT))
        for i in range(5):
            start_path = "./street_view/start.png"
            picPathList.append(start_path)
        pathlist = glob.glob("./street_view/pic/*")
        for i in range(len(pathlist)):
            picPathList.append("./street_view/pic/streetview" + str(i) + ".png")
        for picPath in picPathList:
            # tmp = Image.open(picPath)
            # images.append(tmp)
            img = cv2.imread(picPath)
            img = cv2.resize(img, (WIDTH,HEIGHT))
            # images[0].save(file_name+'.mp4', save_all=True, append_images=images[1:], optimize=False, duration=70, loop=0)
            video.write(img)
        video.release()

    except Exception as e:
        txt = "error:" + str(e)
        print(txt)
        return txt


def GIF_MAKE():
    size = (640, 320)
    # fourcc = cv2.VideoWriter_fourcc('m', 'p', '4', 'v')
    mp4_file = "./data/route2.mp4"
    picPathList = []
    for i in range(5):
        start_path = "./street_view/start.png"
        picPathList.append(start_path)
    pathlist = glob.glob("./street_view/pic/*")
    for i in range(len(pathlist)):
        picPathList.append("./street_view/pic/streetview" + str(i) + ".png")
    # print(picPathList)
    img_array = []
    for filename in picPathList:
        img = cv2.imread(filename)
        img_array.append(img)
    fourcc = cv2.VideoWriter_fourcc('m','p','4', 'v')
    out = cv2.VideoWriter(mp4_file, fourcc, 5.0, size)
    for i in range(len(img_array)):
        out.write(img_array[i])
    out.release()


GIF_MAKE2()
