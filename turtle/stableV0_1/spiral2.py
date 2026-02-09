#Spiral time - v2.0
#Mr Reed - git hub

#Initialise the turtle
import turtle
bob = turtle.Turtle()
bob.speed(9)

dist = 1
for i in range(300):
    bob.forward(dist)
    bob.left(10)
    
    #make the line longer each time inside the loop
    dist = dist + 0.1
