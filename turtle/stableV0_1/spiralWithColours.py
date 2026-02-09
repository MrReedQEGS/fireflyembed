#Spiral with colours
#Mr Reed - git hub

#Initialise the turtle
import turtle,random
bob = turtle.Turtle()
bob.speed(9)

dist = 1
for i in range(300):
    r = random.randint(0,255)
    g = random.randint(0,255)
    b = random.randint(0,255)
    bob.color(r,g,b)
    bob.forward(dist)
    bob.left(10)
    
    #make the line longer each time inside the loop
    dist = dist + 0.1
